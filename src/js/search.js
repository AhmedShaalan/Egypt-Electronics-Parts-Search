// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Searching every shop at once, parts lists, and saved items (kept in this browser).

import { CACHE_MS, MAX_LIST_LINES, PARTIAL_CACHE_MS, SHOP_TIMEOUT_MS } from "./config.js";
import { packSize, score, searchVariants, STRONG, tokens, WEAK } from "./matching.js";
import { SHOPS, SHOPS_BY_KEY } from "./shops.js";

const now = () => new Date().toISOString();
const cache = new Map();
const inflight = new Map();

// ---------- search ----------

// `skip` is an AbortSignal: the user gave up waiting and wants what is already in
async function searchShop(shop, query, skip) {
  const started = performance.now();
  const status = { key: shop.key, name: shop.name };
  const controller = new AbortController();
  let timer;
  let onSkip;
  const giveUp = new Promise((_, reject) => {
    const stop = (why) => {
      controller.abort();
      reject(new Error(why));
    };
    timer = setTimeout(() => stop("timed out"), SHOP_TIMEOUT_MS);
    onSkip = () => stop("skipped");
    skip?.addEventListener("abort", onSkip, { once: true });
  });
  let items = [];
  try {
    const queries = [query, ...searchVariants(query)];
    const batches = await Promise.race([
      Promise.all(queries.map((q) => shop.search(q, controller.signal))),
      giveUp,
    ]);
    items = batches.flat();
    Object.assign(status, { ok: true, count: 0 });
  } catch (err) {
    // one broken shop must not break the search
    if (err.message === "skipped") Object.assign(status, { ok: false, skipped: true, error: "skipped" });
    else {
      const error = err.message === "timed out" ? "timed out" : `${err.name}: ${String(err.message).slice(0, 120)}`;
      Object.assign(status, { ok: false, error });
    }
  } finally {
    clearTimeout(timer);
    skip?.removeEventListener("abort", onSkip);
  }
  status.ms = Math.round(performance.now() - started);
  return { items, status };
}

// onProgress(done, total) is called as each shop finishes
async function runSearch(query, { onProgress, skip } = {}) {
  let done = 0;
  const outcomes = await Promise.all(
    SHOPS.map((s) => searchShop(s, query, skip).then((o) => (onProgress?.(++done, SHOPS.length), o))),
  );
  const results = [];
  const statuses = [];
  for (const { items, status } of outcomes) {
    results.push(...scoreItems(query, items, status));
    statuses.push(status);
  }
  return { query, results: sortResults(results), shops: statuses, searched_at: now() };
}

// keeps the in-stock items that match the query; also fills in status.count
function scoreItems(query, items, status) {
  const results = [];
  const seen = new Set();
  for (const p of items) {
    if (!p.in_stock || p.price <= 0 || seen.has(p.ref)) continue;
    seen.add(p.ref);
    const s = score(query, p.name);
    if (s < WEAK) continue;
    const pack = packSize(p.name);
    results.push({
      ...p,
      score: s,
      pack,
      unit_price: Math.round((p.price / pack) * 1000) / 1000,
      shop_name: SHOPS_BY_KEY[p.shop].name,
    });
  }
  if (status.ok) status.count = results.length;
  return results;
}

const sortResults = (results) => results.sort((a, b) => b.score - a.score || a.price - b.price);

function remember(result) {
  const key = tokens(result.query).join(" ") || result.query.trim().toLowerCase();
  const ttl = result.shops.every((s) => s.ok) ? CACHE_MS : PARTIAL_CACHE_MS;
  cache.set(key, { expires: Date.now() + ttl, result });
  for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
}

// Searches one shop that was skipped earlier and returns a copy of `result` with it merged in.
export async function fetchShop(result, key) {
  const { items, status } = await searchShop(SHOPS_BY_KEY[key], result.query);
  const results = sortResults([...result.results.filter((r) => r.shop !== key), ...scoreItems(result.query, items, status)]);
  const merged = { ...result, results, shops: result.shops.map((s) => (s.key === key ? status : s)) };
  // once nothing is skipped the result is as good as a normal search
  if (!merged.shops.some((s) => s.skipped)) remember(merged);
  return merged;
}

// options: onProgress(done, total) per finished shop; skip, an AbortSignal that
// stops waiting for the shops still running and returns what is already in
export async function searchAll(query, options = {}) {
  const key = tokens(query).join(" ") || query.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return { ...hit.result, cached: true };
  if (!inflight.has(key)) {
    // identical concurrent searches share one run (only the first caller sees progress)
    inflight.set(key, runSearch(query, options).finally(() => inflight.delete(key)));
  }
  const result = await inflight.get(key);
  // a skipped search is deliberately incomplete: searching again should hit every shop
  if (!result.shops.some((s) => s.skipped)) remember(result);
  return { ...result, cached: false };
}

// Start loading the Shopify catalogs so the first search is fast.
export function warmUp() {
  for (const shop of SHOPS) shop.catalog?.().catch(() => {});
}

// ---------- parts lists ----------

const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;
const QTY_PATTERNS = [
  /^(?<q>.+?)\s+[x×*]\s*(?<n>\d+)\s*(?:pcs?|pieces)?$/i, // LM7805 x2
  /^(?<n>\d+)\s*[x×*]\s+(?<q>.+)$/i, // 2x LM7805
  /^(?<q>.+?)\s*[\t,;]\s*(?<n>\d+)\s*(?:pcs?|pieces)?$/i, // LM7805, 2
  /^(?<q>.+?)\s+(?<n>\d+)\s*(?:pcs?|pieces)$/i, // LM7805 2pcs
  /^(?<n>\d+)\s*(?:pcs?|pieces)\s+(?<q>.+)$/i, // 2pcs LM7805
];

export function parseLine(line) {
  line = line.replace(BULLET, "").trim();
  if (!line || line.startsWith("#")) return null;
  for (const pattern of QTY_PATTERNS) {
    const m = line.match(pattern);
    if (m && m.groups.q.trim()) return [m.groups.q.trim(), Math.max(1, parseInt(m.groups.n, 10))];
  }
  return [line, 1];
}

async function mapLimited(items, max, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(max, items.length) }, worker));
  return out;
}

// onProgress(done, total) is called as each distinct part is priced
export async function priceList(text, onProgress) {
  const parsed = text.split(/\r?\n/).map(parseLine).filter(Boolean).slice(0, MAX_LIST_LINES);
  const queries = [...new Set(parsed.map(([q]) => q))];
  // be gentle: at most 4 parts searched at once
  let done = 0;
  onProgress?.(0, queries.length); // the caller's line count may differ from the distinct parts
  const results = await mapLimited(queries, 4, async (q) => {
    const r = await searchAll(q);
    onProgress?.(++done, queries.length);
    return r;
  });
  const found = new Map(queries.map((q, i) => [q, results[i]]));

  const failed = new Map();
  const lines = parsed.map(([query, qty]) => {
    const result = found.get(query);
    for (const s of result.shops) if (!s.ok) failed.set(s.key, s);
    const strong = result.results.filter((r) => r.score >= STRONG);
    const candidates = (strong.length ? strong : result.results.slice(0, 15))
      .slice()
      .sort((a, b) => a.price - b.price)
      .slice(0, 40);
    return { query, qty, weak: !strong.length, candidates };
  });
  return {
    lines,
    shops: SHOPS.map((s) => ({ key: s.key, name: s.name, url: s.base })),
    failed_shops: [...failed.values()],
  };
}

// ---------- saved items and lists (this browser only) ----------

const STORAGE_KEY = "egypt-parts-search:saved";

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.items) && Array.isArray(data.lists)) {
      data.nextId ||= Math.max(0, ...data.items.map((x) => x.id), ...data.lists.map((x) => x.id)) + 1;
      return data;
    }
  } catch {}
  return { items: [], lists: [], nextId: 1 };
}

function store(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

const withShopName = (it) => ({ ...it, shop_name: SHOPS_BY_KEY[it.shop]?.name || it.shop });

export function getSaved() {
  const data = load();
  const byNewest = (a, b) => b.saved_at.localeCompare(a.saved_at);
  return { items: data.items.map(withShopName).sort(byNewest), lists: data.lists.slice().sort(byNewest) };
}

export function saveItem(p) {
  const data = load();
  const t = now();
  const existing = data.items.find((it) => it.shop === p.shop && it.ref === p.ref);
  if (existing) {
    Object.assign(existing, { price: p.price, checked_at: t });
  } else {
    data.items.push({
      id: data.nextId++,
      shop: p.shop,
      ref: p.ref,
      name: p.name,
      url: p.url,
      image: p.image,
      saved_price: p.price,
      price: p.price,
      in_stock: true,
      available: true,
      saved_at: t,
      checked_at: t,
    });
  }
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
}

// the star on a search result toggles, so items are also removed by shop and ref
export function unsaveItem(p) {
  const data = load();
  data.items = data.items.filter((it) => !(it.shop === p.shop && it.ref === p.ref));
  store(data);
}

export function deleteItem(id) {
  const data = load();
  data.items = data.items.filter((it) => it.id !== id);
  store(data);
}

export async function refreshItems() {
  const data = load();
  let failed = 0;
  await mapLimited(data.items, 6, async (it) => {
    const shop = SHOPS_BY_KEY[it.shop];
    if (!shop) return;
    try {
      const signal = AbortSignal.timeout(SHOP_TIMEOUT_MS);
      const result = await shop.check(it.ref, signal);
      if (result === null) Object.assign(it, { available: false, in_stock: false, checked_at: now() });
      else Object.assign(it, { price: result.price, in_stock: result.in_stock, available: true, checked_at: now() });
    } catch {
      failed++;
    }
  });
  store(data);
  return { items: getSaved().items, failed };
}

export function saveList(name, text, total) {
  if (!text.trim()) throw new Error("The list is empty");
  const data = load();
  data.lists.push({
    id: data.nextId++,
    name: name.trim().slice(0, 80) || "Parts list",
    text,
    saved_total: total ?? null,
    saved_at: now(),
  });
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
}

export function renameList(id, name) {
  const data = load();
  const list = data.lists.find((l) => l.id === id);
  if (!list) return;
  list.name = name.trim().slice(0, 80) || list.name;
  store(data);
}

export function deleteList(id) {
  const data = load();
  data.lists = data.lists.filter((l) => l.id !== id);
  store(data);
}

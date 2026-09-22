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
    const settled = await Promise.race([
      Promise.allSettled(queries.map((q) => shop.search(q, controller.signal))),
      giveUp,
    ]);
    // the variants only widen the search, so only the query itself failing fails the shop
    if (settled[0].status === "rejected") throw settled[0].reason;
    items = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
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

// onProgress(done, total, partial) is called as each shop finishes; `partial` is the result so
// far, with the shops still running marked `pending`. With `only`, a set of shop keys, the other
// shops aren't asked: they're marked `unasked`, and skipped, so fetchShop() can ask them later.
async function runSearch(query, { onProgress, skip, only } = {}) {
  let done = 0;
  const asked = SHOPS.filter((s) => !only || only.has(s.key));
  // kept in shop order, so the result doesn't depend on which shop answered first
  const found = SHOPS.map(() => []);
  const statuses = SHOPS.map((s) => (asked.includes(s)
    ? { key: s.key, name: s.name, pending: true }
    : { key: s.key, name: s.name, ok: false, skipped: true, unasked: true, error: "not searched" }));
  const snapshot = () => ({ query, results: sortResults(found.flat()), shops: [...statuses], searched_at: now() });
  await Promise.all(
    asked.map((s) => {
      const i = SHOPS.indexOf(s);
      return searchShop(s, query, skip).then(({ items, status }) => {
        found[i] = scoreItems(query, items, status);
        statuses[i] = status;
        onProgress?.(++done, asked.length, snapshot());
      });
    }),
  );
  return snapshot();
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

// Searches one shop that was skipped earlier. mergeShop() then puts it into a result;
// the two are apart so it goes into whatever the result is by the time the shop answers.
export async function fetchShop(query, key) {
  const { items, status } = await searchShop(SHOPS_BY_KEY[key], query);
  return { key, status, results: scoreItems(query, items, status) };
}

// a copy of `result` with a shop from fetchShop() in it
export function mergeShop(result, fetched) {
  const { key } = fetched;
  const results = sortResults([...result.results.filter((r) => r.shop !== key), ...fetched.results]);
  const merged = { ...result, results, shops: result.shops.map((s) => (s.key === key ? fetched.status : s)) };
  // once nothing is skipped the result is as good as a normal search
  if (!merged.shops.some((s) => s.skipped)) remember(merged);
  return merged;
}

// searches written differently that find the same thing ("mini-360", "Mini 360") share a key
export const searchKey = (query) => tokens(query).join(" ") || query.trim().toLowerCase();

// options: onProgress(done, total, partial) per finished shop; skip, an AbortSignal that stops waiting
// for the shops still running and returns what is already in; cancel, an AbortSignal for a
// caller that no longer wants the answer; fresh, to ask the shops even when the answer is
// remembered; shops, the keys of the only shops to ask (all when left out). Identical searches
// running at once share one run, which stops early (like a skip) once every caller has cancelled.
export async function searchAll(query, { onProgress, skip, cancel, fresh = false, shops } = {}) {
  const only = shops?.length ? new Set(shops) : null;
  // a search at some shops is never remembered (the others are skipped), so it has its own run
  const key = searchKey(query) + (only ? `|${[...only].sort()}` : "");
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() < hit.expires) return { ...hit.result, cached: true };
  let run = inflight.get(key);
  if (!run) {
    const stop = new AbortController();
    run = { stop, listeners: new Set(), callers: 0, done: 0, partial: null };
    const progress = (done, total, partial) => {
      run.done = done;
      run.partial = partial;
      for (const f of run.listeners) f(done, total, partial);
    };
    run.promise = runSearch(query, { onProgress: progress, skip: stop.signal, only }).finally(() => {
      if (inflight.get(key) === run) inflight.delete(key);
    });
    inflight.set(key, run);
  }
  run.callers++;
  if (onProgress) {
    run.listeners.add(onProgress);
    if (run.done) onProgress(run.done, only ? only.size : SHOPS.length, run.partial);
  }
  const onSkip = () => run.stop.abort();
  const onCancel = () => {
    run.listeners.delete(onProgress);
    if (--run.callers > 0) return;
    // nobody is waiting any more: a new identical search starts afresh
    if (inflight.get(key) === run) inflight.delete(key);
    run.stop.abort();
  };
  if (skip?.aborted) onSkip();
  skip?.addEventListener("abort", onSkip, { once: true });
  cancel?.addEventListener("abort", onCancel, { once: true });
  try {
    const result = await run.promise;
    // a skipped search is deliberately incomplete: searching again should hit every shop
    if (!result.shops.some((s) => s.skipped)) remember(result);
    return { ...result, cached: false };
  } finally {
    run.listeners.delete(onProgress);
    skip?.removeEventListener("abort", onSkip);
    cancel?.removeEventListener("abort", onCancel);
  }
}

// Start loading the catalogs searched in the browser (Shopify, Electra, MTM) so the first search is fast.
export function warmUp() {
  for (const shop of SHOPS) shop.catalog?.().catch(() => {});
}

// ---------- parts lists ----------

const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;
const QTY_PATTERNS = [
  // LM7805 x2, but not a size: LCD 16 x 2
  /^(?<q>.+?)(?<!\s\d{1,2})\s+[x×*]\s*(?<n>\d+)\s*(?:pcs?|pieces)?$/i,
  // 2x LM7805, but not a size: 16 x 2 LCD
  /^(?<n>\d+)\s*[x×*]\s+(?!\d{1,2}\s)(?<q>.+)$/i,
  /^(?<q>.+?)\s*[\t,;]\s*(?<n>\d+)\s*(?:pcs?|pieces)?$/i, // LM7805, 2
  /^(?<q>.+?)\s+(?<n>\d+)\s*(?:pcs?|pieces)$/i, // LM7805 2pcs
  /^(?<n>\d+)\s*(?:pcs?|pieces)\s+(?<q>.+)$/i, // 2pcs LM7805
  // 2 Mini-360 buck converter, unless the number belongs to the name: 12 V relay, 4 channel relay, 555 timer
  /^(?<n>\d{1,2})\s+(?!(?:v|mv|a|ma|mah|w|k|kohm|ohm|uf|nf|pf|mm|cm|m|hz|khz|mhz|x|inch|awg|pin|pins|channel|channels|ch|way|digit|digits|segment|bit|core|port|gang|cell|cells)\b)(?<q>.+)$/i,
];

// A list written as a spec sheet keeps its notes after a comma or in brackets:
// "relay DPDT, 12 V coil (HK19F class)" is searched as "relay DPDT". A single word or value
// after a comma is part of the name, though: "Resistor, 10k, 1/4W" is "Resistor 10k 1/4W".
function partName(q) {
  const [first, ...rest] = q.replace(/\([^)]*\)/g, " ").split(",");
  const kept = rest.map((p) => p.trim().replace(/^(\d+(?:\.\d+)?)\s+(?=[a-zµμΩ]+$)/i, "$1")).filter((p) => p && !/\s/.test(p));
  return [first, ...kept].join(" ").replace(/\s+/g, " ").trim() || q;
}

export function parseLine(line) {
  line = line.replace(BULLET, "").trim();
  if (!line || line.startsWith("#")) return null;
  for (const pattern of QTY_PATTERNS) {
    const m = line.match(pattern);
    if (m && m.groups.q.trim()) return [partName(m.groups.q.trim()), Math.max(1, parseInt(m.groups.n, 10))];
  }
  return [partName(line), 1];
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
// A parts-list line from a search: its strong matches, or the best weaker ones when there
// are none, cheapest first. `row` is the line of the pasted text it came from.
export function listLine(query, qty, result, row) {
  const strong = result.results.filter((r) => r.score >= STRONG);
  const candidates = (strong.length ? strong : result.results.slice(0, 15))
    .slice()
    .sort((a, b) => a.price - b.price)
    .slice(0, 40);
  return { query, qty, row, weak: !strong.length, candidates };
}

// Prices one part again, for a line whose name was changed. Options as for searchAll().
export async function priceLine(query, qty, options) {
  const result = await searchAll(query, options);
  return { line: listLine(query, qty, result), failed_shops: result.shops.filter((s) => !s.ok) };
}

export async function priceList(text, onProgress) {
  const all = text.split(/\r?\n/).map((l, row) => {
    const parsed = parseLine(l);
    return parsed && [...parsed, row];
  }).filter(Boolean);
  const parsed = all.slice(0, MAX_LIST_LINES);
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
  const lines = parsed.map(([query, qty, row]) => {
    const result = found.get(query);
    for (const s of result.shops) if (!s.ok) failed.set(s.key, s);
    return listLine(query, qty, result, row);
  });
  return {
    lines,
    shops: SHOPS.map((s) => ({ key: s.key, name: s.name, url: s.base })),
    failed_shops: [...failed.values()],
    left_out: all.length - parsed.length, // lines past MAX_LIST_LINES
  };
}

// "close" = within 25 points of the best match for that line: L7805CV still counts for LM7805,
// but accessories (ranked 30+ points lower) don't win on price
export const isClose = (line, c) => c.score >= Math.max(...line.candidates.map((x) => x.score)) - 25;
// how many to buy: enough packs for the quantity, and at least what the shop's cart takes
// when it has a minimum or sells in multiples ("order in tens")
export function packsNeeded(line, c) {
  const { minimum = 1, multiple_of = 1 } = c.cart_rules || {};
  return Math.max(minimum, Math.ceil(Math.ceil(line.qty / (c.pack || 1)) / multiple_of) * multiple_of);
}
export const lineCost = (line, c) => packsNeeded(line, c) * c.price;

// the default pick per line (an index into its candidates, -1 for none): among the closest
// matches, the cheapest for the quantity needed
export function cheapestPicks(lines) {
  return lines.map((l) => {
    let best = -1;
    l.candidates.forEach((c, i) => {
      if (isClose(l, c) && (best < 0 || lineCost(l, c) < lineCost(l, l.candidates[best]))) best = i;
    });
    return best;
  });
}

// what the list costs from each shop alone, using the picked product where that shop has it;
// shops with the fewest missing parts first, then the cheapest. `used` is [{ line, product }].
export function shopTotals(list, picks) {
  const findable = list.lines.filter((l) => l.candidates.length).length;
  return list.shops.map((shop) => {
    let total = 0;
    const missing = [];
    const used = [];
    list.lines.forEach((line, i) => {
      if (!line.candidates.length) return; // no shop has it, so it can't count against any shop
      const chosen = line.candidates[picks[i]];
      const options = line.weak ? [] : line.candidates.filter((c) => c.shop === shop.key && isClose(line, c));
      const use = chosen && chosen.shop === shop.key ? chosen
        : options.reduce((best, c) => !best || lineCost(line, c) < lineCost(line, best) ? c : best, null);
      if (use) {
        total += lineCost(line, use);
        used.push({ line, product: use });
      } else missing.push(line.query);
    });
    return { ...shop, total, missing, used, found: findable - missing.length };
  }).filter((s) => s.found > 0)
    .sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
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
      // whether its shop's cart can take it from a link, as in the search results
      ...(p.cart ? { cart: true } : {}),
      ...(p.cart_rules ? { cart_rules: p.cart_rules } : {}),
      ...(p.options ? { options: p.options } : {}),
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

// removes items, returning them as stored so restoreSaved() can put them back
export function deleteItems(ids) {
  const data = load();
  const removed = data.items.filter((it) => ids.includes(it.id));
  data.items = data.items.filter((it) => !ids.includes(it.id));
  store(data);
  return removed;
}

// puts back items and lists taken out by deleteItems() or deleteList(), for Undo
export function restoreSaved({ items = [], lists = [] }) {
  const data = load();
  const has = (arr, x) => arr.some((y) => y.id === x.id);
  data.items.push(...items.filter((it) => !has(data.items, it)));
  data.lists.push(...lists.filter((l) => !has(data.lists, l)));
  store(data);
}

// onProgress(done, total) is called as each item is checked
export async function refreshItems(onProgress) {
  const updates = new Map();
  let failed = 0;
  let done = 0;
  const items = load().items;
  onProgress?.(0, items.length);
  await mapLimited(items, 6, async (it) => {
    const shop = SHOPS_BY_KEY[it.shop];
    if (!shop) return;
    try {
      const signal = AbortSignal.timeout(SHOP_TIMEOUT_MS);
      const result = await shop.check(it.ref, signal);
      if (result === null) updates.set(it.id, { available: false, in_stock: false, checked_at: now() });
      else updates.set(it.id, { price: result.price, in_stock: result.in_stock, available: true, checked_at: now() });
    } catch {
      failed++;
    }
    onProgress?.(++done, items.length);
  });
  // saved again from scratch: items saved or removed while the prices were being checked stay that way
  const data = load();
  for (const it of data.items) if (updates.has(it.id)) Object.assign(it, updates.get(it.id));
  store(data);
  return { items: getSaved().items, failed };
}

// `picks` keeps the products chosen instead of the cheapest: { part name: "shop|ref" }, and
// `pickItems` what they were: { "shop|ref": { name, url, price, … } }, to show one the shop
// no longer lists under the part's name. `total` and `shops` are what it cost and from how
// many shops when it was priced.
export function saveList(name, text, total, picks = {}, shops = null, pickItems = {}) {
  if (!text.trim()) throw new Error("The list is empty");
  const data = load();
  const t = now();
  const list = {
    id: data.nextId++,
    name: name.trim().slice(0, 80) || "Parts list",
    text,
    picks,
    pick_items: pickItems,
    saved_total: total ?? null,
    saved_shops: shops,
    saved_at: t,
    priced_at: t,
  };
  data.lists.push(list);
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
  return { id: list.id, name: list.name };
}

// saves a changed list over the saved one it was opened from; null if that one was deleted
export function updateList(id, text, total, picks = {}, shops = null, pickItems = {}) {
  if (!text.trim()) throw new Error("The list is empty");
  const data = load();
  const list = data.lists.find((l) => l.id === id);
  if (!list) return null;
  const t = now();
  Object.assign(list, { text, picks, pick_items: pickItems, saved_total: total ?? null, saved_shops: shops, saved_at: t, priced_at: t, changed: false });
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
  return { id: list.id, name: list.name };
}

// the line a product's name becomes in a list: a leading "#" or bullet would make it a comment or be dropped
export const nameLine = name => name.replace(/\s+/g, " ").replace(/^[\s#*•·-]+/, "").trim() || "Part";

// Adds a product to a saved list, or to a new one when id is null. The list is text, so the
// product goes in as a line with its name, at the top; adding the same part again raises its quantity.
// `pick`, when given, is the product itself (list-model.js pickOf): the line keeps it as its pick,
// so the list prices that product rather than whatever its name finds first
export function addToList(id, name, newName, pick = null) {
  const data = load();
  let list = id == null ? null : data.lists.find((l) => l.id === id);
  if (!list) {
    list = { id: data.nextId++, name: (newName || "").trim().slice(0, 80) || "Parts list", text: "", saved_total: null, saved_at: now() };
    data.lists.push(list);
  }
  const line = nameLine(name);
  // the product's own name is the line; " xN" is added whenever the name alone would read
  // differently ("Resistor 10K 40pcs" is not 40 of them, "1 Screw driver" not 1 screwdriver)
  const plain = String(parseLine(line)) === String(parseLine(`${line} x1`));
  const withQty = (n) => (n === 1 && plain ? line : `${line} x${n}`);
  const qtyOf = (l) => Number(l.match(/\s+x(\d+)$/i)?.[1] || 1);
  const lines = list.text.split("\n").filter((l) => l.trim());
  const same = lines.findIndex((l) => l.trim().replace(/\s+x\d+$/i, "").toLowerCase() === line.toLowerCase());
  if (same >= 0) lines[same] = withQty(qtyOf(lines[same]) + 1);
  else if (lines.length >= MAX_LIST_LINES) throw new Error(`That list is full: a list can have ${MAX_LIST_LINES} parts`);
  else lines.unshift(withQty(1));
  list.text = lines.join("\n");
  if (pick) {
    // keyed by the line as the list reads it back, with the product kept for when it's gone
    const pinKey = `${pick.shop}|${pick.ref}`;
    const [q] = parseLine(`${line} x1`);
    list.picks = { ...list.picks, [q]: pinKey };
    const kept = new Set(Object.values(list.picks));
    list.pick_items = Object.fromEntries(Object.entries({ ...list.pick_items, [pinKey]: pick }).filter(([k]) => kept.has(k)));
  }
  // the total it was priced at no longer covers the list
  if (list.saved_total != null) list.changed = true;
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
  return { id: list.id, name: list.name };
}

export function renameList(id, name) {
  const data = load();
  const list = data.lists.find((l) => l.id === id);
  if (!list) return;
  list.name = name.trim().slice(0, 80) || list.name;
  store(data);
}

// removes a list, returning it as stored so restoreSaved() can put it back
export function deleteList(id) {
  const data = load();
  const removed = data.lists.filter((l) => l.id === id);
  data.lists = data.lists.filter((l) => l.id !== id);
  store(data);
  return removed;
}

export function duplicateList(id) {
  const data = load();
  const list = data.lists.find((l) => l.id === id);
  if (!list) return null;
  const copy = { ...list, id: data.nextId++, name: `${list.name} (copy)`.slice(0, 80), saved_at: now() };
  data.lists.push(copy);
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
  return { id: copy.id, name: copy.name };
}

// stores what a saved list costs now, after it was priced again (see list-tab.jsx), unless it was
// changed or deleted meanwhile. Returns the total it had before, or null.
export function setListPrice(id, text, total, shops) {
  const data = load();
  const list = data.lists.find((l) => l.id === id);
  if (!list || list.text !== text) return null;
  const before = list.changed ? null : list.saved_total;
  Object.assign(list, { saved_total: Math.round(total * 100) / 100, saved_shops: shops, priced_at: now(), changed: false });
  store(data);
  return before;
}

// ---------- backing up and restoring ----------

export function exportSaved() {
  const { items, lists } = load();
  return { app: "egypt-parts-search", version: 1, exported_at: now(), items, lists };
}

// Adds what a backup holds to this browser; what's already here is left as it is. Returns
// how many items and lists were added.
export function importSaved(backup) {
  if (!backup || !Array.isArray(backup.items) || !Array.isArray(backup.lists)) throw new Error("That file isn't a backup from this site");
  const data = load();
  let items = 0;
  let lists = 0;
  for (const it of backup.items) {
    if (!it?.shop || !it.ref || data.items.some((x) => x.shop === it.shop && x.ref === it.ref)) continue;
    data.items.push({ ...it, id: data.nextId++ });
    items++;
  }
  for (const l of backup.lists) {
    if (typeof l?.text !== "string" || data.lists.some((x) => x.name === l.name && x.text === l.text)) continue;
    data.lists.push({ ...l, id: data.nextId++ });
    lists++;
  }
  if (!store(data)) throw new Error("Couldn't save: this browser blocks storage");
  return { items, lists };
}

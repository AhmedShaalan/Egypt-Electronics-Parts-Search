// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The rows of a parts list and what's worked out from them, without the page: the Parts list tab
// (ui/list/) keeps its rows in these shapes.
//
// A row: { id, query, qty, status, done, result, line, pin, pinKey, pick, pickState, error }.
// status is "waiting" (not asked yet), "searching", "ok" or "error". `result` is the search and
// `line` the priced line made from it (search.js listLine). `pin` is the index in line.candidates
// of the product chosen by hand; `pinKey` ("shop|ref") keeps that choice when the list is saved
// or the row priced again, and `pick` what it was (pickOf), to show it when the search no longer
// finds it. Then `pin` is null and `pickState` says why, as checkPick() found:
//   "waiting"   its shop hasn't answered yet
//   "checking"  its shop is being asked about it
//   "out"       out of stock
//   "gone"      the shop no longer has it
//   "unknown"   the shop couldn't be asked
//   "kept"      in stock, only not found by the part's name: it's put back in line.candidates
// A pick stays chosen whatever happens to it, until another product is chosen.

import { parseLine, listLine, lineCost, priceList } from "./search.js";
import { packSize, score } from "./matching.js";
import { SHOPS_BY_KEY } from "./shops.js";
import { SHOP_TIMEOUT_MS } from "./config.js";
import { planOrder, goodFor } from "./plans.js";

export const MAX_QTY = 9999;

// a product's key, the same in every shop's results
export const productKey = p => p.shop + "|" + p.ref;

let nextId = 1;
export const newRow = (query, qty, pinKey = null, pick = null) => ({ id: nextId++, query, qty, status: "waiting", done: 0, result: null, line: null, pin: null, pinKey, pick: pinKey ? pick : null, pickState: null, error: "" });
export const priced = r => r.status === "ok";
export const unpriced = r => r.status === "waiting" || r.status === "searching";
// a priced row whose pick the search didn't find: it's shown, but not bought
export const held = r => priced(r) && !!r.pinKey && r.pin == null;
// a held row whose pick is still being looked for
export const settling = r => held(r) && (r.pickState === "waiting" || r.pickState === "checking");
// the shops a priced row is still waiting for (ui/list/pricing.js shows it before the slowest answer)
export const pendingShops = r => (priced(r) ? r.result.shops.filter(s => s.pending) : []);

export function withQty(r, n) {
  const qty = Math.max(1, Math.min(MAX_QTY, n || 1));
  return { ...r, qty, line: r.line && { ...r.line, qty } };
}

// what a saved list keeps of a product chosen by hand
export const pickOf = c => {
  const { shop, ref, name, url, image, price, cart, cart_query, cart_rules, options } = c;
  return { shop, ref, name, url, image, price, ...(cart ? { cart } : {}), ...(cart_query ? { cart_query } : {}), ...(cart_rules ? { cart_rules } : {}), ...(options ? { options } : {}) };
};
// a pick its shop still sells, as an offer for the line
function offerOf(query, pick) {
  const pack = packSize(pick.name);
  return { ...pick, in_stock: true, score: score(query, pick.name), pack, unit_price: Math.round((pick.price / pack) * 1000) / 1000, shop_name: SHOPS_BY_KEY[pick.shop]?.name || pick.shop };
}

// a row with a new search: its line made again, and the product chosen by hand found again in it
export function withResult(r, result) {
  const line = listLine(r.query, r.qty, result);
  const base = { ...r, status: "ok", error: "", result, line, pin: null, pickState: null };
  if (!r.pinKey) return base;
  const pin = line.candidates.findIndex(c => productKey(c) === r.pinKey);
  if (pin >= 0) return { ...base, pin, pick: pickOf(line.candidates[pin]) };
  if (r.pickState === "kept" && r.pick) return { ...base, pin: line.candidates.push(offerOf(r.query, r.pick)) - 1, pickState: "kept" };
  const key = r.pinKey.split("|")[0];
  const shop = result.shops.find(s => s.key === key);
  // what its shop said about it holds until that shop is searched again
  const asked = r.pickState && r.pickState !== "waiting" && r.result?.shops.find(s => s.key === key) === shop;
  // a shop that just took too long to search would likely take too long to ask as well
  const slow = shop && !shop.ok && (shop.error === "timed out" || shop.skipped);
  return { ...base, pickState: shop?.pending ? "waiting" : asked ? r.pickState : slow ? "unknown" : "checking" };
}

// Asks a pick's shop about it, when the search didn't find it. Gives { pickState, pick }: "kept"
// with its price now, "out", "gone" or "unknown"; or pickState null when it's in stock but
// nothing is known to show it by (a list saved before picks kept their names), so it's dropped.
export async function checkPick(pinKey, pick) {
  const i = pinKey.indexOf("|");
  const shop = SHOPS_BY_KEY[pinKey.slice(0, i)];
  if (!shop) return { pickState: "gone", pick };
  try {
    const now = await shop.check(pinKey.slice(i + 1), AbortSignal.timeout(SHOP_TIMEOUT_MS));
    if (!now) return { pickState: "gone", pick };
    if (!now.in_stock || !(now.price > 0)) return { pickState: "out", pick };
    return pick ? { pickState: "kept", pick: { ...pick, price: now.price } } : { pickState: null, pick: null };
  } catch {
    return { pickState: "unknown", pick };
  }
}
// a row with what checkPick() found
export function withPick(r, { pickState, pick }) {
  if (pickState === "kept") return withResult({ ...r, pick, pickState }, r.result);
  if (!pickState) return withResult({ ...r, pinKey: null, pick: null }, r.result);
  return { ...r, pick, pickState };
}

// A row as a line of the saved text. "LM7805 x2" reads back as 2 of LM7805; a name that would
// read back differently on its own ("2 Mini-360") is written with its quantity after it.
export function rowText(r) {
  const ways = r.qty === 1 ? [r.query, `${r.query} x1`] : [`${r.query} x${r.qty}`, `${r.query}, ${r.qty}`];
  return ways.find(t => { const p = parseLine(t); return p && p[0] === r.query && p[1] === r.qty; }) ?? ways[0];
}
export const listText = rows => rows.map(rowText).join("\n");
// the products chosen by hand, by part: what a saved list keeps of them
export const listPicks = rows => Object.fromEntries(rows.filter(r => r.pinKey).map(r => [r.query, r.pinKey]));
// and what those products were, by key, to show them should a search not find them again
export const listPickItems = rows => Object.fromEntries(rows.filter(r => r.pinKey && r.pick).map(r => [r.pinKey, r.pick]));

// the rows the plans work from: priced, with something to buy, and not waiting on a pick
export const planRows = rows => rows.filter(r => priced(r) && !held(r) && r.line.candidates.length).map(r => ({ id: r.id, line: r.line, pin: r.pin }));

// the cheapest close match for a line, and a weaker match cheaper than `c`, if there is one
export const cheapestGood = line => line.candidates.filter(x => goodFor(line, x)).reduce((a, b) => (!a || lineCost(line, b) < lineCost(line, a) ? b : a), null);
export const weakCheaper = (line, c) => line.candidates.filter(x => !goodFor(line, x) && lineCost(line, x) < lineCost(line, c)).sort((a, b) => lineCost(line, a) - lineCost(line, b))[0];
export const isPick = (r, c) => r.pin != null && r.line.candidates[r.pin] === c;

// What a saved list costs now: every part priced again, and the plan it would be bought with
// (Custom when it has picks), delivery included. A pick that can't be bought isn't counted, as on
// the Parts list.
export async function priceSavedList(list, fees) {
  const data = await priceList(list.text);
  const found = await Promise.all(data.lines.map(async line => {
    const want = list.picks?.[line.query];
    if (!want) return { line, pin: null };
    const pin = line.candidates.findIndex(c => productKey(c) === want);
    if (pin >= 0) return { line, pin };
    const { pickState, pick } = await checkPick(want, list.pick_items?.[want] ?? null);
    if (pickState === "kept") return { line: { ...line, candidates: [...line.candidates, offerOf(line.query, pick)] }, pin: line.candidates.length };
    return pickState ? null : { line, pin: null };
  }));
  const rows = found.filter(x => x && x.line.candidates.length).map(({ line, pin }, id) => ({ id, line, pin }));
  const plans = planOrder(rows, fees, "best");
  const plan = plans.custom || plans.best;
  return { total: plan ? plan.total : 0, shops: plan ? plan.used.size : 0 };
}

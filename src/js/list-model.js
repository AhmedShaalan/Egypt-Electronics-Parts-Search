// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The rows of a parts list and what's worked out from them, without the page: the Parts list tab
// (ui/list/) keeps its rows in these shapes.
//
// A row: { id, query, qty, status, done, result, line, pin, pinKey, pickGone, error }.
// status is "waiting" (not asked yet), "searching", "ok" or "error". `result` is the search and
// `line` the priced line made from it (search.js listLine). `pin` is the index in line.candidates
// of the product chosen by hand; `pinKey` ("shop|ref") keeps that choice when the list is saved
// or the row priced again, and `pickGone` says the chosen product wasn't found this time.

import { parseLine, listLine, lineCost, priceList } from "./search.js";
import { planOrder, goodFor } from "./plans.js";

export const MAX_QTY = 9999;

// a product's key, the same in every shop's results
export const productKey = p => p.shop + "|" + p.ref;

let nextId = 1;
export const newRow = (query, qty, pinKey = null) => ({ id: nextId++, query, qty, status: "waiting", done: 0, result: null, line: null, pin: null, pinKey, pickGone: false, error: "" });
export const priced = r => r.status === "ok";
export const unpriced = r => r.status === "waiting" || r.status === "searching";

export function withQty(r, n) {
  const qty = Math.max(1, Math.min(MAX_QTY, n || 1));
  return { ...r, qty, line: r.line && { ...r.line, qty } };
}

// a row with a new search: its line made again, and the product chosen by hand found again in it
export function withResult(r, result) {
  const line = listLine(r.query, r.qty, result);
  const pin = r.pinKey ? line.candidates.findIndex(c => productKey(c) === r.pinKey) : -1;
  return { ...r, status: "ok", error: "", result, line, pin: pin >= 0 ? pin : null, pickGone: !!r.pinKey && pin < 0 };
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

// the rows the plans work from: priced, with something to buy
export const planRows = rows => rows.filter(r => priced(r) && r.line.candidates.length).map(r => ({ id: r.id, line: r.line, pin: r.pin }));

// the cheapest close match for a line, and a weaker match cheaper than `c`, if there is one
export const cheapestGood = line => line.candidates.filter(x => goodFor(line, x)).reduce((a, b) => (!a || lineCost(line, b) < lineCost(line, a) ? b : a), null);
export const weakCheaper = (line, c) => line.candidates.filter(x => !goodFor(line, x) && lineCost(line, x) < lineCost(line, c)).sort((a, b) => lineCost(line, a) - lineCost(line, b))[0];
export const isPick = (r, c) => r.pin != null && r.line.candidates[r.pin] === c;

// What a saved list costs now: every part priced again, and the plan it would be bought with
// (Custom when it has picks), delivery included.
export async function priceSavedList(list, fees) {
  const data = await priceList(list.text);
  const rows = data.lines.filter(l => l.candidates.length).map((line, id) => {
    const want = list.picks?.[line.query];
    const pin = want ? line.candidates.findIndex(c => productKey(c) === want) : -1;
    return { id, line, pin: pin >= 0 ? pin : null };
  });
  const plans = planOrder(rows, fees, "best");
  const plan = plans.custom || plans.best;
  return { total: plan ? plan.total : 0, shops: plan ? plan.used.size : 0 };
}

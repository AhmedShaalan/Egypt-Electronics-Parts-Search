// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// What can be done to the list on the tab: adding and changing parts, choosing products, saving
// and opening lists, and ordering.

import { parseLine, lineCost, packsNeeded, saveList, updateList, renameList } from "../../search.js";
import { MAX_LIST_LINES } from "../../config.js";
import { goodFor } from "../../plans.js";
import { newRow, priced, withQty, listText, listPicks, productKey, priceSavedList as priceWithFees } from "../../list-model.js";
import { $, money, toast } from "../common.js";
import { plural } from "../format.js";
import { fillCart } from "../cart.js";
import { currentSaved, reloadSaved } from "../saved.js";
import { store, set, change, rowById, pricing, plansNow, snap, isSavedList, isDirty, hasUnsaved, newName, PLAN_NAMES } from "./state.js";
import { price, stopRow, stopAll, currentRun } from "./pricing.js";

/* ---------- changing the list ---------- */

// adds the parts typed or pasted in, one per line, at the top of the list in the order they're
// written; false when there was nothing to add
export function addText(text) {
  const parsed = text.split(/\r?\n/).map(parseLine).filter(Boolean);
  if (!parsed.length) { toast("Type a part name or number"); return false; }
  const rows = store.state.rows.slice();
  const added = [];
  let more = 0;
  let left = 0;
  for (const [q, n] of parsed) {
    // a part already on the list gets the quantity added
    const same = rows.findIndex(r => r.query.toLowerCase() === q.toLowerCase());
    if (same >= 0) { rows[same] = withQty(rows[same], rows[same].qty + n); more++; continue; }
    // or twice in what was pasted
    const twice = added.findIndex(r => r.query.toLowerCase() === q.toLowerCase());
    if (twice >= 0) { added[twice] = withQty(added[twice], added[twice].qty + n); continue; }
    if (rows.length + added.length >= MAX_LIST_LINES) { left++; continue; }
    added.push(newRow(q, n));
  }
  change({ rows: [...added, ...rows] });
  price(added.map(r => r.id));
  const said = [added.length && `Added ${plural(added.length, "part")}`, more && `${plural(more, "part")} already on the list got more`].filter(Boolean).join(", ");
  toast(left ? `${said || "Nothing added"}. A list can have ${MAX_LIST_LINES} parts, so ${left} ${left === 1 ? "was" : "were"} left out` : said);
  return true;
}

export const setQty = (id, n) => change(s => ({ rows: s.rows.map(r => (r.id === id ? withQty(r, n) : r)) }), id);

// Choosing a product makes the plan Custom, starting from the plan on screen: only this row
// changes. Choosing what the plan has anyway takes the pick away again.
export function choose(id, i) {
  const { plans, strategy } = plansNow();
  const r = rowById(id);
  const c = r.line.candidates[i];
  const base = strategy === "custom" ? store.state.customBase : strategy;
  const hasGood = r.line.candidates.some(x => goodFor(r.line, x));
  // a part with only weaker matches is bought only when picked, so choosing its pick again unpicks it
  const pin = hasGood ? (c === plans[base]?.assign.get(id) ? null : i) : (r.pin === i ? null : i);
  const rows = store.state.rows.map(x => (x.id === id ? { ...x, pin, pinKey: pin == null ? null : productKey(c), pickGone: false } : x));
  const picked = rows.some(x => x.pin != null && priced(x) && x.line.candidates.some(y => goodFor(x.line, y)));
  const next = picked ? "custom" : base;
  change({ rows, customBase: base, strategy: next, open: null }, id);
  if (strategy !== "custom" && next === "custom") toast(`Switched to ${PLAN_NAMES.custom}, on top of ${PLAN_NAMES[base]}`);
  requestAnimationFrame(() => document.querySelector(`[data-row="${id}"] .l-product`)?.focus());
}

export function remove(id) {
  const idx = store.state.rows.findIndex(r => r.id === id);
  const gone = store.state.rows[idx];
  stopRow(id);
  change(s => ({ rows: s.rows.filter(r => r.id !== id), open: s.open === id ? null : s.open }));
  const run = currentRun();
  toast(`Removed “${gone.query}”`, {
    label: "Undo",
    run: () => {
      if (run !== currentRun() || rowById(id)) return;
      // a row removed while it was searched goes back to waiting, its search having been stopped
      const back = priced(gone) ? gone : { ...gone, status: "waiting", done: 0 };
      change(s => { const rows = s.rows.slice(); rows.splice(Math.min(idx, rows.length), 0, back); return { rows }; });
      if (!priced(gone)) price([gone.id]);
    },
  });
}

/* ---------- lists: saving, opening, starting afresh ---------- */

export function save() {
  const { plan } = plansNow();
  const text = listText(store.state.rows);
  const name = store.state.name.trim() || newName();
  // what it costs, delivery included, once every part is priced
  const done = !pricing() && plan;
  const total = done ? Math.round(plan.total * 100) / 100 : null;
  const shops = done ? plan.used.size : null;
  try {
    let list = isSavedList() ? updateList(store.state.listId, text, total, listPicks(store.state.rows), shops) : null;
    if (list && list.name !== name) renameList(list.id, name);
    list ||= saveList(name, text, total, listPicks(store.state.rows), shops);
    set({ listId: list.id, name, savedSnap: snap({ ...store.state, name }) });
    reloadSaved();
    toast(`Saved “${name}”`);
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

// leaving a list with unsaved changes asks first (leave-dialog.jsx); `go` runs once it may be left
export function askToLeave(go) {
  if (hasUnsaved()) set({ leaving: go });
  else go();
}

function replaceList(patch) {
  stopAll();
  set({ rows: [], name: newName(), listId: null, savedSnap: null, strategy: "best", customBase: "best", open: null, filters: {}, editing: null, flash: new Set(), retrying: false, ...patch });
}

// opens a saved list in this tab and prices it again
export function openSavedList(id) {
  const l = currentSaved().lists.find(x => x.id === id);
  if (!l) return;
  if (store.state.listId === id && !isDirty()) { location.hash = "#list"; return; }
  askToLeave(() => {
    const parsed = l.text.split(/\r?\n/).map(parseLine).filter(Boolean);
    const picks = l.picks || {};
    const rows = parsed.slice(0, MAX_LIST_LINES).map(([q, n]) => newRow(q, n, picks[q] || null));
    const next = { rows, name: l.name, listId: l.id, strategy: Object.keys(picks).length ? "custom" : "best" };
    replaceList({ ...next, savedSnap: snap(next) });
    location.hash = "#list";
    price(rows.map(r => r.id));
    if (parsed.length > MAX_LIST_LINES) toast(`Only the first ${MAX_LIST_LINES} parts were opened; ${parsed.length - MAX_LIST_LINES} more were left out`);
  });
}

// an empty list to start from
export function startNewList() {
  askToLeave(() => {
    replaceList({});
    location.hash = "#list";
    // once the tab has switched: a hidden box can't take focus
    setTimeout(() => $("#list-text").focus(), 50);
  });
}

// what a saved list costs now, for Update prices on the Saved tab, with the delivery fees set here
export const priceSavedList = list => priceWithFees(list, store.state.fees);

/* ---------- ordering ---------- */

export const orderMessage = entries => `Hello, I'd like to order:\n${entries.map(e => `- ${packsNeeded(e.line, e.product)} × ${e.product.name}`).join("\n")}\n\n`
  + `Total on your site: ${money(entries.reduce((sum, e) => sum + lineCost(e.line, e.product), 0))}`;

export async function fill(shop, entries) {
  set({ filling: { shop, done: 0, total: 0 } });
  try {
    await fillCart(shop, entries, (done, total) => set({ filling: { shop, done, total } }));
  } catch (e) {
    toast(e.message);
  } finally {
    set({ filling: null });
  }
}

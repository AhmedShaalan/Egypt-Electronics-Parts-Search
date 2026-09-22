// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// What can be done to the list on the tab: adding and changing parts, choosing products, saving
// and opening lists, and ordering.

import { parseLine, nameLine, lineCost, packsNeeded, saveList, updateList, renameList } from "../../search.js";
import { MAX_LIST_LINES, SHOP_TIMEOUT_MS } from "../../config.js";
import { goodFor } from "../../plans.js";
import { SHOPS_BY_KEY } from "../../shops.js";
import { newRow, priced, withQty, withResult, listText, listPicks, listPickItems, productKey, pickOf, priceSavedList as priceWithFees } from "../../list-model.js";
import { $, money, toast, collapse } from "../common.js";
import { plural } from "../format.js";
import { fillCart } from "../cart.js";
import { currentSaved, reloadSaved } from "../saved.js";
import { store, set, change, flashRows, rowById, pricing, plansNow, snap, isSavedList, isDirty, hasUnsaved, newName, PLAN_NAMES } from "./state.js";
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

// products added to a saved list from Search or Saved (add-to-list.js): when that list is open
// here, they join it here too, at the top, each with the product as its pick, so the tab shows
// them and saving it doesn't drop them. A list with nothing unsaved stays that way.
export function addedToList(id, products) {
  if (store.state.listId !== id) return;
  const clean = !isDirty();
  const rows = store.state.rows.slice();
  const added = [];
  for (const p of products) {
    // as addToList reads it: " x1" keeps a name like "Resistor 10K 40pcs" from being taken as 40
    const [q] = parseLine(`${nameLine(p.name)} x1`);
    const same = rows.findIndex(r => r.query.toLowerCase() === q.toLowerCase());
    if (same >= 0) { rows[same] = withQty(rows[same], rows[same].qty + 1); continue; }
    const twice = added.findIndex(r => r.query.toLowerCase() === q.toLowerCase());
    if (twice >= 0) { added[twice] = withQty(added[twice], added[twice].qty + 1); continue; }
    if (rows.length + added.length < MAX_LIST_LINES) added.push(newRow(q, 1, productKey(p), pickOf(p)));
  }
  // the products added are picks, which only Your picks buys: on top of the plan on screen
  const { strategy } = store.state;
  const plan = added.length && strategy !== "custom" ? { strategy: "custom", customBase: strategy } : {};
  change({ rows: [...added, ...rows], ...plan });
  if (clean) set({ savedSnap: snap(store.state) });
  price(added.map(r => r.id));
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
  const rows = store.state.rows.map(x => (x.id === id ? { ...x, pin, pinKey: pin == null ? null : productKey(c), pick: pin == null ? null : pickOf(c), pickState: null } : x));
  const picked = rows.some(x => x.pin != null && priced(x) && x.line.candidates.some(y => goodFor(x.line, y)));
  const next = picked ? "custom" : base;
  change({ rows, customBase: base, strategy: next, open: null }, id);
  if (strategy !== "custom" && next === "custom") toast(`Switched to ${PLAN_NAMES.custom}, on top of ${PLAN_NAMES[base]}`);
  requestAnimationFrame(() => document.querySelector(`[data-row="${id}"] .l-product`)?.focus());
}

// Choosing a colour or size of a product sold in several: the row's pick becomes that one, asked of
// its shop for its price, so it's bought as it is and can go in the cart. A sold-out one isn't.
// Like choose(), it makes the plan Custom.
export async function chooseOption(id, c, ref) {
  const shop = SHOPS_BY_KEY[c.shop];
  const label = c.options.choices.find(x => x.ref === ref)?.label;
  let p;
  try {
    p = await shop.option(c, ref, AbortSignal.timeout(SHOP_TIMEOUT_MS));
  } catch {
    toast(`${shop.name} didn't answer. Try again`);
    return;
  }
  const r = rowById(id);
  if (!r || !priced(r)) return;
  if (!p?.in_stock || !(p.price > 0)) { toast(`${label} is out of stock at ${shop.name}`); return; }
  const { strategy } = store.state;
  const base = strategy === "custom" ? store.state.customBase : strategy;
  const rows = store.state.rows.map(x => (x.id === id ? withResult({ ...x, pinKey: productKey(p), pick: pickOf(p), pickState: "kept" }, x.result) : x));
  change({ rows, customBase: base, strategy: "custom" }, id);
  if (strategy !== "custom") toast(`Switched to ${PLAN_NAMES.custom}, on top of ${PLAN_NAMES[base]}`);
}

// Another colour or size of a row's product, for buying more than one of them: a row of its own
// below it, named after it and with it as its pick, for as many as that row. One already on the
// list is lit up instead.
export async function addOption(id, c, ref) {
  const shop = SHOPS_BY_KEY[c.shop];
  const label = c.options.choices.find(x => x.ref === ref)?.label;
  let p;
  try {
    p = await shop.option(c, ref, AbortSignal.timeout(SHOP_TIMEOUT_MS));
  } catch {
    toast(`${shop.name} didn't answer. Try again`);
    return;
  }
  const r = rowById(id);
  if (!r) return;
  if (!p?.in_stock || !(p.price > 0)) { toast(`${label} is out of stock at ${shop.name}`); return; }
  const [q] = parseLine(`${nameLine(p.name)} x1`);
  const { rows, strategy } = store.state;
  const there = rows.find(x => x.pinKey === productKey(p) || x.query.toLowerCase() === q.toLowerCase());
  if (there) { flashRows([there.id]); toast(`${label} is already on the list`); return; }
  if (rows.length >= MAX_LIST_LINES) { toast(`A list can have ${MAX_LIST_LINES} parts`); return; }
  const row = { ...newRow(q, r.qty, productKey(p), pickOf(p)), pickState: "kept" };
  const next = rows.slice();
  next.splice(next.indexOf(r) + 1, 0, row);
  const base = strategy === "custom" ? store.state.customBase : strategy;
  change({ rows: next, customBase: base, strategy: "custom" });
  price([row.id]);
  flashRows([row.id]);
  toast(strategy !== "custom" ? `Added ${label}. Switched to ${PLAN_NAMES.custom}, on top of ${PLAN_NAMES[base]}` : `Added ${label}`);
}

export async function remove(id) {
  if (!rowById(id)) return;
  stopRow(id);
  await collapse(document.querySelector(`[data-row="${id}"]`));
  const idx = store.state.rows.findIndex(r => r.id === id);
  if (idx < 0) return;
  const gone = store.state.rows[idx];
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
    const { rows } = store.state;
    let list = isSavedList() ? updateList(store.state.listId, text, total, listPicks(rows), shops, listPickItems(rows)) : null;
    if (list && list.name !== name) renameList(list.id, name);
    list ||= saveList(name, text, total, listPicks(rows), shops, listPickItems(rows));
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
    const rows = parsed.slice(0, MAX_LIST_LINES).map(([q, n]) => newRow(q, n, picks[q] || null, l.pick_items?.[picks[q]] || null));
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

// " (choose colour: Blue, Green)" after a product sold in several when none was chosen, for the
// shop to ask which; a chosen one says it in its name
const toChoose = p => (p.options && !p.options.chosen ? ` (choose ${p.options.what}: ${p.options.choices.map(x => x.label).join(", ")})` : "");
const partsCost = entries => entries.reduce((sum, e) => sum + lineCost(e.line, e.product), 0);

// a shop's part of the order, to send them or keep: headed by the shop's name, underlined, so a
// copy pasted elsewhere still says where it's from. Its total is the shop's on the page: the parts
// and the delivery fee set for it, which is an estimate (~).
export const orderMessage = (shopName, entries, fee) => `${shopName}\n${"-".repeat(shopName.length)}\n`
  + `${entries.map(e => `- ${packsNeeded(e.line, e.product)} × ${e.product.name}${toChoose(e.product)}`).join("\n")}\n\n`
  + `Parts: ${money(partsCost(entries))}\nDelivery: ~${money(fee)}\nTotal: ~${money(partsCost(entries) + fee)}`;

// the whole order: each shop's part as above, then all of it, the order's total on the page.
// `baskets` are [shop name, entries, delivery fee].
export function wholeOrderMessage(baskets) {
  const total = baskets.reduce((sum, [, es, fee]) => sum + partsCost(es) + fee, 0);
  const all = baskets.length > 1 ? `\n\nAll ${baskets.length} shops: ~${money(total)}` : "";
  return baskets.map(([name, es, fee]) => orderMessage(name, es, fee)).join("\n\n") + all;
}

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

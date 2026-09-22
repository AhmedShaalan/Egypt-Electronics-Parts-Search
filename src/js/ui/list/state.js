// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Parts list tab's state, the plans worked out from it, and the changes every part of the
// tab makes through change(), which lights up the rows the plan moved because of them.

import { MAX_LIST_LINES } from "../../config.js";
import { SHOPS_BY_KEY } from "../../shops.js";
import { createPlanner } from "../../plans.js";
import { newRow, planRows, unpriced, pendingShops, settling, held } from "../../list-model.js";
import { toast } from "../common.js";
import { plural } from "../format.js";
import { currentSaved, onSavedChange } from "../saved.js";
import { loadJSON, saveJSON } from "../storage.js";
import { createStore } from "../store.js";

export const PLAN_NAMES = { best: "Best overall", cheap: "Cheapest parts, any shop", fewest: "Fewest shops", custom: "Your picks" };
export const newName = () => "Parts list " + new Date().toLocaleDateString();

// The rows are described in list-model.js.
export const store = createStore({
  rows: [],
  name: newName(),
  listId: null,       // the saved list this is, once saved or opened
  savedSnap: null,    // snap() of the list as saved, to tell when it has changed
  strategy: "best",   // best | cheap | fewest | custom
  customBase: "best", // the plan Custom starts from: the picks, the rest as that plan has them
  fees: loadFees(),
  open: null,         // the row whose offers are showing
  filters: {},        // row id -> the text filtering its offers
  editing: null,      // the row in the Change part dialog
  flash: new Set(),   // rows that just changed, lit up for a moment
  retrying: false,    // asking the shops that failed again
  filling: null,      // { shop, done, total } while a shop's cart fills
  leaving: null,      // what runs once the list may be left, while Unsaved changes asks (leave-dialog.jsx)
  discarding: false,  // whether Discard changes is asking (discard-dialog.jsx)
  tick: 0,            // bumped when the saved lists change
}, { onSet: (s, before) => { if (draftChanged(s, before)) saveDraft(s); } });
export const { set } = store;
onSavedChange(() => set({ tick: store.state.tick + 1 }));

export const rowById = id => store.state.rows.find(r => r.id === id);
// until every shop has answered for every part, the totals may still change
export const pricing = () => store.state.rows.some(r => unpriced(r) || pendingShops(r).length || settling(r));

// what saving keeps, to tell unsaved changes
export const snap = s => JSON.stringify([s.name.trim(), s.rows.map(r => [r.query, r.qty, r.pinKey])]);
export const isSavedList = () => store.state.listId != null && currentSaved().lists.some(l => l.id === store.state.listId);
export const isDirty = () => !isSavedList() || snap(store.state) !== store.state.savedSnap;
// parts on the list that aren't saved as they are
export const hasUnsaved = () => store.state.rows.length > 0 && isDirty();

/* ---------- delivery fees and the list being worked on, kept in this browser ---------- */

function loadFees() {
  const f = loadJSON("delivery-fees", null);
  return f && typeof f.default === "number" ? { default: f.default, byShop: f.byShop || {} } : { default: 50, byShop: {} };
}
export function setFees(fees) {
  saveJSON("delivery-fees", fees);
  change({ fees });
}

// the fees for a backup, or null while they've never been changed from the default
export const feesToBackUp = () => (loadJSON("delivery-fees", null) ? store.state.fees : null);

// a backup's fees, taken only by a browser that has none of its own yet. True if they were.
export function restoreFees(f) {
  if (typeof f?.default !== "number" || loadJSON("delivery-fees", null)) return false;
  const fee = v => (typeof v === "number" && v >= 0 && v <= 9999 ? v : null);
  if (fee(f.default) == null) return false;
  const byShop = Object.fromEntries(Object.entries(f.byShop ?? {}).filter(([k, v]) => SHOPS_BY_KEY[k] && fee(v) != null));
  setFees({ default: f.default, byShop });
  return true;
}

// the list on the tab survives a reload; it's priced again when the tab is next shown. It's
// written only when what it keeps changed, not as the shops answer.
const DRAFT_FIELDS = ["name", "listId", "savedSnap", "strategy", "customBase"];
function draftChanged(s, before) {
  if (DRAFT_FIELDS.some(k => s[k] !== before[k])) return true;
  const a = s.rows, b = before.rows;
  return a !== b && (a.length !== b.length || a.some((r, i) => r.query !== b[i].query || r.qty !== b[i].qty || r.pinKey !== b[i].pinKey || r.pick?.name !== b[i].pick?.name));
}
function saveDraft(s) {
  saveJSON("list-draft", {
    name: s.name, listId: s.listId, savedSnap: s.savedSnap, strategy: s.strategy, customBase: s.customBase,
    rows: s.rows.map(r => [r.query, r.qty, r.pinKey, r.pick]),
  });
}
function loadDraft() {
  const d = loadJSON("list-draft", null);
  if (!d || !Array.isArray(d.rows)) return;
  set({
    name: d.name || store.state.name, listId: d.listId ?? null, savedSnap: d.savedSnap ?? null,
    strategy: d.strategy || "best", customBase: d.customBase || "best",
    rows: d.rows.slice(0, MAX_LIST_LINES).map(([q, n, k, p]) => newRow(q, n, k, p)),
  });
}
loadDraft();

/* ---------- the plans ---------- */

const planner = createPlanner();
export function plansNow() {
  const s = store.state;
  const plans = planner(planRows(s.rows), s.fees, s.customBase);
  const strategy = s.strategy === "custom" && !plans.custom ? s.customBase : s.strategy;
  return { plans, strategy, plan: plans[strategy] };
}

// Makes a change and lights up the rows the plan moved to another shop because of it, so a
// row never changes shop silently. `touched` is the row the person changed: when others moved
// because of it, a message says so.
export function change(patch, touched = null) {
  const before = plansNow().plan?.assign;
  set(patch);
  // Custom with no picks left is the plan it started from; a pick that can't be bought now is
  // still a pick, and it's bought again once its shop has it
  if (store.state.strategy === "custom" && !pricing() && !plansNow().plans.custom && !store.state.rows.some(held)) set({ strategy: store.state.customBase });
  const { plan, strategy } = plansNow();
  if (!before || !plan) return;
  const moved = [...plan.assign].filter(([id, c]) => id !== touched && before.has(id) && before.get(id).shop !== c.shop);
  if (!moved.length) return;
  flashRows(moved.map(([id]) => id));
  if (touched == null) return;
  const shops = [...new Set(moved.map(([, c]) => c.shop_name))];
  toast(`${plural(moved.length, "other part")} moved to ${shops.join(" and ")} ${strategy === "fewest" ? "to keep to fewer shops" : "to keep the total lowest"}`);
}

export function flashRows(ids) {
  set(s => ({ flash: new Set([...s.flash, ...ids]) }));
  setTimeout(() => set(s => ({ flash: new Set([...s.flash].filter(id => !ids.includes(id))) })), 1400);
}

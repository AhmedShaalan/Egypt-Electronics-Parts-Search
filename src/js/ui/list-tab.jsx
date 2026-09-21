// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Parts list tab. Parts typed or pasted in become rows, each priced at every shop as it's
// added, and edited in place. Beside them, the order: how to buy (plans.js), delivery fees, and
// one basket per shop with its cart. A list is named and saved in this browser.

import { render } from "preact";
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import { SHOPS, SHOPS_BY_KEY } from "../shops.js";
import { searchAll, fetchShop, mergeShop, parseLine, listLine, priceList, lineCost, packsNeeded, saveList, updateList, renameList } from "../search.js";
import { MAX_LIST_LINES } from "../config.js";
import { weakReason } from "../matching.js";
import { planOrder, goodFor } from "../plans.js";
import { $, money, toast, announce, key, safeUrl, priceDetail, onBackdrop } from "./common.js";
import { copy } from "./copy.js";
import { cartShop, fillCart } from "./cart.js";
import { currentSaved, onSavedChange, reloadSaved, partCount } from "./saved.js";
import { createStore } from "./store.js";

const FEES_KEY = "egypt-parts-search:delivery-fees";
const DRAFT_KEY = "egypt-parts-search:list-draft";
const AT_ONCE = 4; // parts searched at the same time, to be gentle with the shops
const PLAN_NAMES = { best: "Best overall", cheap: "Lowest parts cost", fewest: "Fewest shops", custom: "Custom" };
const newName = () => "Parts list " + new Date().toLocaleDateString();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- state ---------- */

// A row: { id, query, qty, status, done, result, line, pin, pinKey, pickGone, error }.
// status is "waiting" (not asked yet), "searching", "ok" or "error". `result` is the search and
// `line` the priced line made from it (search.js listLine). `pin` is the index in line.candidates
// of the product chosen by hand; `pinKey` ("shop|ref") keeps that choice when the list is saved
// or the row priced again, and `pickGone` says the chosen product wasn't found this time.
const store = createStore({
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
  tick: 0,            // bumped when the saved lists change
}, { onSet: saveDraft });
const { set } = store;
onSavedChange(() => set({ tick: store.state.tick + 1 }));

let nextId = 1;
const newRow = (query, qty, pinKey = null) => ({ id: nextId++, query, qty, status: "waiting", done: 0, result: null, line: null, pin: null, pinKey, pickGone: false, error: "" });
const rowById = id => store.state.rows.find(r => r.id === id);
const priced = r => r.status === "ok";
const pricing = () => store.state.rows.some(r => r.status === "waiting" || r.status === "searching");
const withQty = (r, n) => {
  const qty = Math.max(1, Math.min(9999, n || 1));
  return { ...r, qty, line: r.line && { ...r.line, qty } };
};
// a row with a new search: its line made again, and the product chosen by hand found again in it
function withResult(r, result) {
  const line = listLine(r.query, r.qty, result);
  const pin = r.pinKey ? line.candidates.findIndex(c => key(c) === r.pinKey) : -1;
  return { ...r, status: "ok", error: "", result, line, pin: pin >= 0 ? pin : null, pickGone: !!r.pinKey && pin < 0 };
}

// what saving keeps, to tell unsaved changes
const snap = s => JSON.stringify([s.name.trim(), s.rows.map(r => [r.query, r.qty, r.pinKey])]);
const isSavedList = () => store.state.listId != null && currentSaved().lists.some(l => l.id === store.state.listId);
const isDirty = () => !isSavedList() || snap(store.state) !== store.state.savedSnap;

// A row as a line of the saved text. "LM7805 x2" reads back as 2 of LM7805; a name that would
// read back differently on its own ("2 Mini-360") is written with its quantity after it.
function rowText(r) {
  const ways = r.qty === 1 ? [r.query, `${r.query} x1`] : [`${r.query} x${r.qty}`, `${r.query}, ${r.qty}`];
  return ways.find(t => { const p = parseLine(t); return p && p[0] === r.query && p[1] === r.qty; }) ?? ways[0];
}
const listText = rows => rows.map(rowText).join("\n");
const listPicks = rows => Object.fromEntries(rows.filter(r => r.pinKey).map(r => [r.query, r.pinKey]));

/* ---------- delivery fees and the list being worked on, kept in this browser ---------- */

function loadFees() {
  try {
    const f = JSON.parse(localStorage.getItem(FEES_KEY));
    if (f && typeof f.default === "number") return { default: f.default, byShop: f.byShop || {} };
  } catch { /* none saved, or storage blocked */ }
  return { default: 50, byShop: {} };
}
function setFees(fees) {
  try { localStorage.setItem(FEES_KEY, JSON.stringify(fees)); } catch { /* kept for this visit only */ }
  change({ fees });
}

// the list on the tab survives a reload; it's priced again when the tab is next shown
let lastDraft = "";
function saveDraft() {
  const draft = JSON.stringify({
    name: store.state.name, listId: store.state.listId, savedSnap: store.state.savedSnap, strategy: store.state.strategy, customBase: store.state.customBase,
    rows: store.state.rows.map(r => [r.query, r.qty, r.pinKey]),
  });
  if (draft === lastDraft) return;
  lastDraft = draft;
  try { localStorage.setItem(DRAFT_KEY, draft); } catch { /* kept for this visit only */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!d || !Array.isArray(d.rows)) return;
    lastDraft = JSON.stringify(d);
    set({
      name: d.name || store.state.name, listId: d.listId ?? null, savedSnap: d.savedSnap ?? null,
      strategy: d.strategy || "best", customBase: d.customBase || "best",
      rows: d.rows.slice(0, MAX_LIST_LINES).map(([q, n, k]) => newRow(q, n, k)),
    });
  } catch { /* nothing kept */ }
}
loadDraft();

/* ---------- the plans ---------- */

// planOrder() takes a few milliseconds, so it runs again only when a priced row, the fees or
// Custom's starting plan changed, not on every redraw while the shops answer
let memo = null;
function plansNow() {
  const input = store.state.rows.filter(r => priced(r) && r.line.candidates.length);
  const same = memo && memo.fees === store.state.fees && memo.base === store.state.customBase && memo.input.length === input.length
    && memo.input.every((m, i) => m.id === input[i].id && m.line === input[i].line && m.pin === input[i].pin);
  if (!same) {
    const rows = input.map(r => ({ id: r.id, line: r.line, pin: r.pin }));
    memo = { fees: store.state.fees, base: store.state.customBase, input: rows, plans: planOrder(rows, store.state.fees, store.state.customBase) };
  }
  const { plans } = memo;
  const strategy = store.state.strategy === "custom" && !plans.custom ? store.state.customBase : store.state.strategy;
  return { plans, strategy, plan: plans[strategy] };
}

// Makes a change and lights up the rows the plan moved to another shop because of it, so a
// row never changes shop silently. `touched` is the row the person changed: when others moved
// because of it, a message says so.
function change(patch, touched = null) {
  const before = plansNow().plan?.assign;
  set(patch);
  // Custom with no picks left is the plan it started from
  if (store.state.strategy === "custom" && !pricing() && !plansNow().plans.custom) set({ strategy: store.state.customBase });
  const { plan, strategy } = plansNow();
  if (!before || !plan) return;
  const moved = [...plan.assign].filter(([id, c]) => id !== touched && before.has(id) && before.get(id).shop !== c.shop);
  if (!moved.length) return;
  flashRows(moved.map(([id]) => id));
  if (touched == null) return;
  const shops = [...new Set(moved.map(([, c]) => c.shop_name))];
  toast(`${plural(moved.length, "other part")} moved to ${shops.join(" and ")} ${strategy === "fewest" ? "to keep to fewer shops" : "to keep the total lowest"}`);
}

function flashRows(ids) {
  set(s => ({ flash: new Set([...s.flash, ...ids]) }));
  setTimeout(() => set(s => ({ flash: new Set([...s.flash].filter(id => !ids.includes(id))) })), 1400);
}

/* ---------- pricing rows ---------- */

let listRun = 0;             // bumped when another list is opened, so pricing for the old one stops
const queue = [];            // rows waiting to be searched: { id, run }
const cancels = new Map();   // row id -> AbortController, for a row removed while it searches
let active = 0;

// a row already waiting in the queue, or being searched, isn't searched twice
const searching = id => cancels.has(id) && !cancels.get(id).signal.aborted;
function price(ids) {
  const fresh = ids.filter(id => !searching(id) && !queue.some(j => j.id === id && j.run === listRun));
  queue.push(...fresh.map(id => ({ id, run: listRun })));
  pump();
}
function pump() {
  while (active < AT_ONCE && queue.length) {
    const job = queue.shift();
    const r = rowById(job.id);
    if (job.run !== listRun || !r || priced(r) || searching(r.id)) continue;
    active++;
    priceRow(r, job.run).finally(() => {
      active--;
      pump();
      if (!active && !queue.length && store.state.rows.length) announce(`Priced ${plural(store.state.rows.filter(priced).length, "part")}`);
    });
  }
}
async function priceRow(r, run) {
  const ctl = new AbortController();
  cancels.set(r.id, ctl);
  const setRow = patch => set(s => ({ rows: s.rows.map(x => (x.id === r.id ? { ...x, ...patch } : x)) }));
  setRow({ status: "searching", done: 0, error: "" });
  try {
    const result = await searchAll(r.query, { cancel: ctl.signal, onProgress: done => run === listRun && !ctl.signal.aborted && setRow({ done }) });
    const now = rowById(r.id);
    // removed, changed to another part or another list opened meanwhile
    if (run !== listRun || ctl.signal.aborted || !now || now.query !== r.query) return;
    // other rows may move to another shop once this one is priced; they light up, without a message
    change(s => ({ rows: s.rows.map(x => (x.id === r.id ? withResult(x, result) : x)) }));
    flashRows([r.id]);
  } catch (e) {
    if (run === listRun && !ctl.signal.aborted) setRow({ status: "error", error: e.message });
  } finally {
    if (cancels.get(r.id) === ctl) cancels.delete(r.id);
  }
}

// called when a tab is shown: a list kept from the last visit is priced once it's looked at
export function listTabShown() {
  const waiting = store.state.rows.filter(r => r.status === "waiting");
  if (waiting.length) price(waiting.map(r => r.id));
}

/* ---------- changing the list ---------- */

function addText(text) {
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
    if (rows.length >= MAX_LIST_LINES) { left++; continue; }
    const r = newRow(q, n);
    rows.push(r);
    added.push(r);
  }
  change({ rows });
  price(added.map(r => r.id));
  const said = [added.length && `Added ${plural(added.length, "part")}`, more && `${plural(more, "part")} already on the list got more`].filter(Boolean).join(", ");
  toast(left ? `${said || "Nothing added"}. A list can have ${MAX_LIST_LINES} parts, so ${left} ${left === 1 ? "was" : "were"} left out` : said);
  return true;
}

const setQty = (id, n) => change(s => ({ rows: s.rows.map(r => (r.id === id ? withQty(r, n) : r)) }), id);

// Choosing a product makes the plan Custom, starting from the plan on screen: only this row
// changes. Choosing what the plan has anyway takes the pick away again.
function choose(id, i) {
  const { plans, strategy } = plansNow();
  const r = rowById(id);
  const c = r.line.candidates[i];
  const base = strategy === "custom" ? store.state.customBase : strategy;
  const hasGood = r.line.candidates.some(x => goodFor(r.line, x));
  // a part with only weaker matches is bought only when picked, so choosing its pick again unpicks it
  const pin = hasGood ? (c === plans[base]?.assign.get(id) ? null : i) : (r.pin === i ? null : i);
  const rows = store.state.rows.map(x => (x.id === id ? { ...x, pin, pinKey: pin == null ? null : key(c), pickGone: false } : x));
  const picked = rows.some(x => x.pin != null && priced(x) && x.line.candidates.some(y => goodFor(x.line, y)));
  const next = picked ? "custom" : base;
  change({ rows, customBase: base, strategy: next, open: null }, id);
  if (strategy !== "custom" && next === "custom") toast(`Switched to Custom: ${PLAN_NAMES[base]} with your pick`);
  requestAnimationFrame(() => document.querySelector(`[data-row="${id}"] .l-product`)?.focus());
}

function remove(id) {
  const idx = store.state.rows.findIndex(r => r.id === id);
  const gone = store.state.rows[idx];
  cancels.get(id)?.abort();
  change(s => ({ rows: s.rows.filter(r => r.id !== id), open: s.open === id ? null : s.open }));
  const run = listRun;
  toast(`Removed “${gone.query}”`, {
    label: "Undo",
    run: () => {
      if (run !== listRun || rowById(id)) return;
      // a row removed while it was searched goes back to waiting, its search having been stopped
      const back = priced(gone) ? gone : { ...gone, status: "waiting", done: 0 };
      change(s => { const rows = s.rows.slice(); rows.splice(Math.min(idx, rows.length), 0, back); return { rows }; });
      if (!priced(gone)) price([gone.id]);
    },
  });
}

// the shops that failed, for any part
function failedShops() {
  const failed = new Map();
  for (const r of store.state.rows) if (priced(r)) for (const s of r.result.shops) if (!s.ok) failed.set(s.key, s);
  return [...failed.values()];
}

// asks the shops that failed again, for each part they failed on, and merges in what they answer
async function retryShops() {
  const run = listRun;
  const failed = failedShops().map(s => s.key);
  const jobs = [];
  for (const r of store.state.rows) {
    if (!priced(r)) continue;
    for (const s of r.result.shops) if (!s.ok && !jobs.some(j => j.query === r.query && j.key === s.key)) jobs.push({ query: r.query, key: s.key });
  }
  set({ retrying: true });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { query, key: shop } = jobs[next++];
      try {
        const fetched = await fetchShop(query, shop);
        if (run !== listRun) return;
        change(s => ({ rows: s.rows.map(r => (priced(r) && r.query === query ? withResult(r, mergeShop(r.result, fetched)) : r)) }));
      } catch { /* still failing: it stays on the list of shops that didn't answer */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, jobs.length) }, worker));
  if (run !== listRun) return;
  set({ retrying: false });
  const still = failedShops().map(s => s.key);
  const back = failed.filter(k => !still.includes(k)).map(k => SHOPS_BY_KEY[k].name);
  toast(back.length ? `${back.join(", ")} answered` : "Still no answer. Try again later");
}

/* ---------- lists: saving, opening, starting afresh ---------- */

function save() {
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
  } catch (e) { toast(e.message); }
}

// leaving a list with unsaved changes asks first
const canLeave = () => !store.state.rows.length || !isDirty() || confirm(`“${store.state.name.trim() || "This list"}” has changes that aren't saved. Leave it anyway?`);

function replaceList(patch) {
  listRun++;
  queue.length = 0;
  for (const c of cancels.values()) c.abort();
  cancels.clear();
  set({ rows: [], name: newName(), listId: null, savedSnap: null, strategy: "best", customBase: "best", open: null, filters: {}, editing: null, flash: new Set(), retrying: false, ...patch });
}

// opens a saved list in this tab and prices it again
export function openSavedList(id) {
  const l = currentSaved().lists.find(x => x.id === id);
  if (!l) return;
  if (store.state.listId === id && !isDirty()) { location.hash = "#list"; return; }
  if (!canLeave()) return;
  const parsed = l.text.split(/\r?\n/).map(parseLine).filter(Boolean);
  const picks = l.picks || {};
  const rows = parsed.slice(0, MAX_LIST_LINES).map(([q, n]) => newRow(q, n, picks[q] || null));
  const next = { rows, name: l.name, listId: l.id, strategy: Object.keys(picks).length ? "custom" : "best" };
  replaceList({ ...next, savedSnap: snap(next) });
  location.hash = "#list";
  price(rows.map(r => r.id));
  if (parsed.length > MAX_LIST_LINES) toast(`Only the first ${MAX_LIST_LINES} parts were opened; ${parsed.length - MAX_LIST_LINES} more were left out`);
}

// an empty list to start from
export function startNewList() {
  if (!canLeave()) return;
  replaceList({});
  location.hash = "#list";
  // once the tab has switched: a hidden box can't take focus
  setTimeout(() => $("#list-text").focus(), 50);
}

// What a saved list costs now, for Update prices on the Saved tab: every part priced again, and
// the plan it would be bought with (Custom when it has picks), delivery included.
export async function priceSavedList(list) {
  const data = await priceList(list.text);
  const rows = data.lines.filter(l => l.candidates.length).map((line, id) => {
    const want = list.picks?.[line.query];
    const pin = want ? line.candidates.findIndex(c => key(c) === want) : -1;
    return { id, line, pin: pin >= 0 ? pin : null };
  });
  const plans = planOrder(rows, store.state.fees, "best");
  const plan = plans.custom || plans.best;
  return { total: plan ? plan.total : 0, shops: plan ? plan.used.size : 0 };
}

/* ---------- ordering ---------- */

const orderMessage = entries => `Hello, I'd like to order:\n${entries.map(e => `- ${packsNeeded(e.line, e.product)} × ${e.product.name}`).join("\n")}\n\n`
  + `Total on your site: ${money(entries.reduce((sum, e) => sum + lineCost(e.line, e.product), 0))}`;

async function fill(shop, entries) {
  set({ filling: { shop, done: 0, total: 0 } });
  try {
    await fillCart(shop, entries, (done, total) => set({ filling: { shop, done, total } }));
  } catch (e) {
    toast(e.message);
  } finally {
    set({ filling: null });
  }
}

/* ---------- icons ---------- */

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
const Chevron = () => <svg class="l-chev" {...svg}><path d="m6 9 6 6 6-6" /></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
const ExtIcon = () => <svg {...svg}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const PenIcon = () => <svg {...svg}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const TrashIcon = () => <svg {...svg}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>;
const CopyIcon = () => <svg {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const CartIcon = () => <svg {...svg}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.9a1.5 1.5 0 0 0 1.5-1.1L21 7H6" /></svg>;
const PlusIcon = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>;
const CloseIcon = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;

/* ---------- pieces ---------- */

function Thumb({ p, big }) {
  const [failed, fail] = useReducer(() => true, false);
  const src = p.image && safeUrl(p.image) !== "#" && !failed ? p.image : null;
  const cls = `l-thumb${big ? " big" : ""}`;
  return src
    ? <img class={cls} src={src} alt="" loading="lazy" referrerpolicy="no-referrer" onError={fail} />
    : <span class={cls} />;
}

// a number box that keeps what's being typed while the page redraws around it. Numbers are held
// to min..max: `onValue` gets each one typed, `onCommit` the final one once, when the box is left
// or Enter is pressed, and the box then shows the number kept
function NumField({ value, onValue, onCommit, min = -Infinity, max = Infinity, ...props }) {
  const [text, setText] = useState(String(value));
  const el = useRef(null);
  const committed = useRef(value);
  useEffect(() => { committed.current = value; if (document.activeElement !== el.current) setText(String(value)); }, [value]);
  const clamp = t => { const n = parseInt(t, 10); return Number.isNaN(n) ? null : Math.min(max, Math.max(min, n)); };
  const commit = () => {
    const n = clamp(text) ?? value;
    setText(String(n));
    if (n !== committed.current) { committed.current = n; onCommit?.(n); }
  };
  return (
    <input {...props} ref={el} type="number" inputmode="numeric" min={min} max={max} value={text}
      onInput={e => { setText(e.currentTarget.value); const n = clamp(e.currentTarget.value); if (n != null) onValue?.(n); }}
      onKeyDown={e => { if (e.key === "Enter") commit(); }} onBlur={commit} />
  );
}

function Qty({ r }) {
  return (
    <div class="l-qty">
      <NumField class="num" min={1} max={9999} value={r.qty} aria-label={`Quantity of ${r.query}`}
        onCommit={n => setQty(r.id, n)} />
      <span class="l-steps">
        <button type="button" aria-label="One more" onClick={() => setQty(r.id, r.qty + 1)}>+</button>
        <button type="button" aria-label="One fewer" onClick={() => setQty(r.id, r.qty - 1)} disabled={r.qty <= 1}>−</button>
      </span>
    </div>
  );
}

function RowMenu({ r, c }) {
  const close = e => { e.currentTarget.closest("details").open = false; };
  return (
    <details class="menu right s-menu" onClick={e => e.target.closest('[role="menuitem"]') && close(e)}>
      <summary class="s-icon" title="More" aria-label={`More for ${r.query}`}><DotsIcon /></summary>
      <div class="menu-list" role="menu">
        <button type="button" role="menuitem" onClick={() => set({ editing: r.id, open: null })}><PenIcon />Change part</button>
        {c ? <a role="menuitem" href={safeUrl(c.url)} target="_blank" rel="noopener"><ExtIcon />Open at {c.shop_name}</a> : null}
        <button type="button" role="menuitem" class="danger" onClick={() => remove(r.id)}><TrashIcon />Remove</button>
      </div>
    </details>
  );
}

const cheapestGood = line => line.candidates.filter(x => goodFor(line, x)).reduce((a, b) => (!a || lineCost(line, b) < lineCost(line, a) ? b : a), null);
const weakCheaper = (line, c) => line.candidates.filter(x => !goodFor(line, x) && lineCost(line, x) < lineCost(line, c)).sort((a, b) => lineCost(line, a) - lineCost(line, b))[0];
const isPick = (r, c) => r.pin != null && r.line.candidates[r.pin] === c;

// why the plan took this product, when a cheaper one was there: as a chip on the row, and in full under its offers
function WhyChip({ r, c }) {
  if (isPick(r, c)) return <span class="l-chip pick">Your pick</span>;
  const low = cheapestGood(r.line);
  if (low && lineCost(r.line, low) < lineCost(r.line, c)) {
    return <span class="l-chip soft" title={`${money(lineCost(r.line, c) - lineCost(r.line, low))} more here, one delivery fewer`}>Saves a delivery</span>;
  }
  if (weakCheaper(r.line, c)) return <span class="l-chip warn" title="A cheaper look-alike was skipped because it's probably a different part">Look-alike skipped</span>;
  return null;
}
function Why({ r, c }) {
  if (!c || isPick(r, c)) return null;
  const low = cheapestGood(r.line);
  if (low && lineCost(r.line, low) < lineCost(r.line, c)) {
    return <p class="l-why">{low.shop_name} is {money(lineCost(r.line, c) - lineCost(r.line, low))} cheaper for this part, but buying it at {c.shop_name} <b>saves a delivery</b>.</p>;
  }
  const weak = weakCheaper(r.line, c);
  if (weak) return <p class="l-why">A cheaper “{weak.name}” at {weak.shop_name} was skipped. {weakReason(r.query, weak.name)}.</p>;
  return null;
}

// every offer for the row, floating over the rows below it
// choosing an offer closes the list, so the arrow keys only move between the offers, which
// the browser would otherwise choose as it went; Space or Enter chooses
function moveAmong(e) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.click(); return; }
  if (!step) return;
  e.preventDefault();
  const all = [...e.currentTarget.closest("tbody").querySelectorAll("input[type=radio]")];
  all[Math.min(all.length - 1, Math.max(0, all.indexOf(e.currentTarget) + step))].focus();
}

function Offers({ r, c, filter }) {
  const line = r.line;
  const box = useRef(null);
  useEffect(() => {
    if (matchMedia("(hover: hover)").matches) box.current.querySelector("input").focus({ preventScroll: true });
    box.current.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const onClick = e => { if (!e.target.closest(".l-options, .l-product")) set({ open: null }); };
    const onKey = e => {
      if (e.key !== "Escape") return;
      set({ open: null });
      document.querySelector(`[data-row="${r.id}"] .l-product`)?.focus();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);
  const f = filter.trim().toLowerCase();
  const list = line.candidates.map((x, i) => ({ x, i })).filter(({ x }) => !f || `${x.name} ${x.shop_name}`.toLowerCase().includes(f));
  const byCost = (a, b) => lineCost(line, a.x) - lineCost(line, b.x);
  const good = list.filter(({ x }) => goodFor(line, x)).sort(byCost);
  const weak = list.filter(({ x }) => !goodFor(line, x)).sort(byCost);
  const low = good[0] ? lineCost(line, good[0].x) : 0;
  const tr = ({ x, i }) => (
    <tr key={i} class={x === c ? "chosen" : ""} onClick={e => !e.target.closest("a, input") && choose(r.id, i)}>
      <td><input type="radio" class="l-radio" name={`pick-${r.id}`} checked={x === c}
        aria-label={`${x.name} at ${x.shop_name}, ${money(lineCost(line, x))}`} onClick={() => choose(r.id, i)} onKeyDown={moveAmong} /></td>
      <td>
        <span class="l-pname"><Thumb p={x} big />
          <span class="l-pname-text">{x.name}<small class="num">{priceDetail(line, x)}</small>
            <small class="l-shop-inline">{x.shop_name}{x.cart ? "" : " · order on their site"}</small>
            {goodFor(line, x) ? null : <small class="l-note">{weakReason(r.query, x.name)}</small>}</span>
        </span>
      </td>
      <td class="l-shop-cell">{x.shop_name}{x.cart ? null : <small>order on their site</small>}</td>
      <td class="r num"><b>{money(lineCost(line, x))}</b>
        {goodFor(line, x) ? (lineCost(line, x) > low ? <small class="l-delta">+{money(lineCost(line, x) - low)}</small> : <span class="l-chip soft">Cheapest</span>) : null}
      </td>
      <td><a class="s-icon" href={safeUrl(x.url)} target="_blank" rel="noopener" title={`Open at ${x.shop_name}`} aria-label={`Open ${x.name} at ${x.shop_name}`}><ExtIcon /></a></td>
    </tr>
  );
  return (
    <div class="l-options" ref={box}>
      <input type="search" class="l-filter" placeholder="Filter by name or shop" value={filter} aria-label="Filter offers"
        autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"
        onInput={e => set({ filters: { ...store.state.filters, [r.id]: e.currentTarget.value } })} />
      <div class="l-table-wrap">
        <table class="l-opts">
          <thead><tr><th><span class="sr-only">Chosen</span></th><th>Product</th><th class="l-shop-cell">Shop</th><th class="r">Your cost</th><th><span class="sr-only">Open</span></th></tr></thead>
          <tbody>
            {good.map(tr)}
            {weak.length ? <tr class="group"><td colspan="5">Weaker matches, probably a different part. Never picked for you.</td></tr> : null}
            {weak.map(tr)}
            {list.length ? null : <tr class="group"><td colspan="5">Nothing matches “{filter}”.</td></tr>}
          </tbody>
        </table>
      </div>
      <Why r={r} c={c} />
    </div>
  );
}

function Row({ r, s, plan }) {
  const c = priced(r) ? plan?.assign.get(r.id) : null;
  const open = s.open === r.id;
  const toggle = () => set({ open: open ? null : r.id });
  const n = r.line?.candidates.length || 0;
  let chip = null;
  let cost = null;
  let product;
  if (r.status === "waiting" || r.status === "searching") {
    product = (
      <div class="l-product empty"><span class="l-searching"><span class="l-bar-anim" />
        {r.status === "waiting" ? "Waiting its turn…" : `Asking the shops… ${r.done} of ${SHOPS.length}`}</span></div>
    );
  } else if (r.status === "error") {
    chip = <span class="l-chip bad">Not searched</span>;
    product = <div class="l-product empty">Couldn't search: {r.error} <button class="s-linkbtn" type="button" onClick={() => price([r.id])}>Try again</button></div>;
  } else if (!c) {
    chip = <span class="l-chip bad">{n ? "Check match" : "Not found"}</span>;
    const msg = n ? "Only look-alikes found. Open them to pick one yourself, or try a part number." : "No shop has this in stock. Try another name or a part number.";
    product = n
      ? <button class="l-product empty" type="button" aria-expanded={open} onClick={toggle}><span class="l-product-text">{msg}</span><Chevron /></button>
      : <div class="l-product empty">{msg}</div>;
  } else {
    chip = <WhyChip r={r} c={c} />;
    cost = money(lineCost(r.line, c));
    product = (
      <button class="l-product" type="button" aria-expanded={open} onClick={toggle} title={`${plural(n, "offer")}. Click to compare`}>
        <Thumb p={c} />
        <span class="l-product-text">
          <span class="l-product-name">{c.name}</span>
          <span class="l-product-meta"><span class="l-shop">{c.shop_name}</span> · {priceDetail(r.line, c)}</span>
        </span>
        <span class="l-chip soft l-count">{plural(n, "offer")}</span><Chevron />
      </button>
    );
  }
  const gone = r.pickGone && r.pin == null
    ? <span class="l-chip warn" title="The product chosen for this part is sold out or gone, so the plan chose again">Your pick is gone</span> : null;
  return (
    <div class={`l-row${s.flash.has(r.id) ? " flash" : ""}${open ? " open" : ""}`} data-row={r.id}>
      <div class="l-row-main">
        <Qty r={r} />
        <div class="l-name-line"><span class="l-part" title={r.query}>{r.query}</span>{chip}{gone}</div>
        <div class="l-cost num">{cost ?? "—"}</div>
        <div class="l-acts"><RowMenu r={r} c={c} /></div>
        {product}
      </div>
      {open && n ? <Offers r={r} c={c} filter={s.filters[r.id] || ""} /> : null}
    </div>
  );
}

function Intake() {
  const box = useRef(null);
  const add = () => {
    if (addText(box.current.value)) box.current.value = "";
    box.current.focus();
  };
  return (
    <div class="l-intake">
      <label for="list-text">Add parts</label>
      <textarea id="list-text" ref={box} rows="3" spellcheck={false} autocomplete="off"
        placeholder={"One part per line, or paste a whole list:\nLM7805 x2\n10k resistor, 20"}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
      <div class="l-intake-foot">
        <span class="l-hint">Quantity: <code>x2</code>, <code>2x</code>, <code>2pcs</code>, or a count in front or after a comma. <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> adds.</span>
        <button class="btn primary" type="button" onClick={add}>Add to list</button>
      </div>
    </div>
  );
}

function Head({ s }) {
  const lists = currentSaved().lists;
  const dirty = isDirty();
  const saved = isSavedList();
  const label = !s.rows.length && !saved ? null : !saved ? "Not saved" : dirty ? "Unsaved changes" : "Saved";
  const close = e => { e.currentTarget.closest("details").open = false; };
  return (
    <div class="l-head">
      <input class="l-name" value={s.name} maxlength="80" aria-label="List name" autocomplete="off" spellcheck={false}
        data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"
        onInput={e => set({ name: e.currentTarget.value })} />
      {label ? <span class={`l-save-state${dirty ? " dirty" : ""}`} role="status"><span class="l-dot" />{label}</span> : null}
      <div class="l-head-actions">
        <button class="btn primary" type="button" disabled={!dirty || !s.rows.length} onClick={save}>{dirty || !saved ? (saved ? "Save changes" : "Save") : "Saved"}</button>
        <details class="menu right s-menu l-lists" onClick={e => e.target.closest('[role="menuitem"]') && close(e)}>
          <summary class="btn">My lists<Chevron /></summary>
          <div class="menu-list" role="menu">
            {lists.map(l => (
              <button type="button" role="menuitem" key={l.id} onClick={() => openSavedList(l.id)} aria-current={l.id === s.listId ? "true" : null}>
                <span class="l-menu-name">{l.name}</span><small>{plural(partCount(l), "part")}</small>
              </button>
            ))}
            {lists.length ? <hr /> : null}
            <button type="button" role="menuitem" onClick={startNewList}><PlusIcon />New list</button>
            <button type="button" role="menuitem" disabled={!s.rows.length} onClick={() => copy(listText(s.rows))}><CopyIcon />Copy as text</button>
          </div>
        </details>
      </div>
    </div>
  );
}

function ShopsStatus({ s }) {
  if (!s.rows.some(priced)) return null;
  const failed = failedShops();
  return (
    <div class="l-status">
      <span>Prices from <b>{SHOPS.length - failed.length} of {SHOPS.length} shops</b></span>
      {failed.length ? <>
        <span class="l-fail">{failed.map(f => f.name || SHOPS_BY_KEY[f.key]?.name).join(", ")} didn't answer</span>
        <button class="s-linkbtn" type="button" disabled={s.retrying} onClick={retryShops}>{s.retrying ? "Asking again…" : "Try again"}</button>
      </> : null}
    </div>
  );
}

function Strategies({ s, plans, strategy }) {
  const S = [
    ["best", "parts + delivery, lowest"],
    ["cheap", "cheapest product for each part"],
    ["fewest", "fewest deliveries to wait for"],
  ];
  const c = plans.custom;
  return (
    <div class="l-strats" role="radiogroup" aria-label="How to buy">
      {S.map(([k, sub]) => {
        const p = plans[k];
        return (
          <button class="l-strat" type="button" role="radio" key={k} aria-checked={strategy === k} disabled={!p} onClick={() => change({ strategy: k })}>
            <span class="l-radio" /><span class="t">{PLAN_NAMES[k]}{k === "best" ? <span class="l-rec">Suggested</span> : null}</span>
            <span class="v num">{p ? money(p.total) : "—"}</span>
            <span class="s">{p ? `${plural(p.used.size, "shop")} · ${sub}` : sub}</span>
          </button>
        );
      })}
      {c
        ? <button class="l-strat" type="button" role="radio" aria-checked={strategy === "custom"} onClick={() => change({ strategy: "custom" })}>
            <span class="l-radio" /><span class="t">Custom</span><span class="v num">{money(c.total)}</span>
            <span class="s">{plural(c.used.size, "shop")} · {plural(c.picks, "pick")} of yours on top of {PLAN_NAMES[s.customBase]}</span>
          </button>
        : <div class="l-strat off"><span class="l-radio" /><span class="t">Custom</span><span class="v" />
            <span class="s">Choose another product in any row to make your own</span></div>}
    </div>
  );
}

// the fee for each shop the person set, then the one for any other shop; every picker lists its
// own shop and the shops without a fee yet, the ones in the order first
function Fees({ s, used }) {
  const fees = s.fees;
  const own = Object.keys(fees.byShop);
  const free = SHOPS.map(x => x.key).filter(k => !(k in fees.byShop))
    .sort((a, b) => used.has(b) - used.has(a) || SHOPS_BY_KEY[a].name.localeCompare(SHOPS_BY_KEY[b].name));
  const label = k => `${SHOPS_BY_KEY[k]?.name ?? k}${used.has(k) ? " · in your order" : ""}`;
  const byShop = entries => ({ ...fees, byShop: Object.fromEntries(entries) });
  return (
    <ul class="l-fee-list">
      {own.map((k, i) => (
        <li key={i}>
          <select aria-label="Shop" value={k}
            onChange={e => setFees(byShop(Object.entries(fees.byShop).map(([x, v]) => [x === k ? e.currentTarget.value : x, v])))}>
            {[k, ...free].map(x => <option value={x} key={x}>{label(x)}</option>)}
          </select>
          <NumField min={0} max={9999} step="5" value={fees.byShop[k]} aria-label={`Delivery from ${SHOPS_BY_KEY[k]?.name ?? k}`}
            onValue={v => setFees(byShop(Object.entries(fees.byShop).map(([x, old]) => [x, x === k ? v : old])))} />
          <span class="l-unit">EGP</span>
          <button class="s-icon" type="button" title="Use the usual fee" aria-label={`Remove ${SHOPS_BY_KEY[k]?.name ?? k}'s fee`}
            onClick={() => setFees(byShop(Object.entries(fees.byShop).filter(([x]) => x !== k)))}><CloseIcon /></button>
        </li>
      ))}
      <li>
        <select aria-label="Shop" disabled><option>Any other shop</option></select>
        <NumField id="l-fee" min={0} max={9999} step="5" value={fees.default} aria-label="Delivery from any other shop"
          onValue={v => setFees({ ...fees, default: v })} />
        <span class="l-unit">EGP</span><span />
      </li>
      {free.length
        ? <li class="l-fee-add"><button class="s-linkbtn" type="button" onClick={() => setFees(byShop([...Object.entries(fees.byShop), [free[0], fees.default]]))}>+ Add a shop's fee</button></li>
        : null}
    </ul>
  );
}

function Basket({ shop, entries, filling }) {
  const sh = SHOPS_BY_KEY[shop];
  const sub = entries.reduce((sum, e) => sum + lineCost(e.line, e.product), 0);
  const cartable = cartShop(shop) && entries.some(e => e.product.cart);
  const left = cartable ? entries.filter(e => !e.product.cart).length : 0;
  const busy = filling?.shop === shop;
  return (
    <div class="l-basket">
      <div class="l-basket-head"><b>{sh.name}</b>{cartable ? null : <span class="l-chip soft">Add by hand</span>}<span class="num l-sub">{money(sub)}</span></div>
      <ul>
        {entries.map(e => (
          <li key={e.row.id}>
            <span><code>{packsNeeded(e.line, e.product)}×</code> <a class="l-item-link" href={safeUrl(e.product.url)} target="_blank" rel="noopener" title={`Open at ${sh.name}`}>{e.product.name}</a></span>
            <span class="num">{money(lineCost(e.line, e.product))}</span>
          </li>
        ))}
      </ul>
      {cartable
        ? <div class="l-cart-actions">
            <button class="btn" type="button" disabled={!!filling} onClick={() => fill(shop, entries)} title="Opens the shop with these in its cart, quantities set. You check out there.">
              <CartIcon />{busy ? (filling.total > 1 ? `Adding ${Math.min(filling.done + 1, filling.total)} of ${filling.total}…` : "Opening…") : `Fill cart at ${sh.name}`}
            </button>
            <button class="btn l-icon-only" type="button" title="Copy the order as a message" aria-label={`Copy the ${sh.name} order as a message`} onClick={() => copy(orderMessage(entries))}><CopyIcon /></button>
          </div>
        : <button class="btn" type="button" title="Copy the order as a message, for their WhatsApp or order form" onClick={() => copy(orderMessage(entries))}><CopyIcon />Copy as message</button>}
      {cartable
        ? (left ? <p class="l-how">{left === 1 ? "One part has" : `${left} parts have`} options to choose, so {left === 1 ? "it goes" : "they go"} in the cart by hand on their site.</p> : null)
        : <p class="l-how">Its cart can't be filled from here. Open each part and add it on their site.</p>}
    </div>
  );
}

function Order({ s, plans, strategy, plan }) {
  const empty = !s.rows.length;
  const okRows = s.rows.filter(priced);
  const missing = okRows.filter(r => !plan?.assign.has(r.id)).length;
  const waiting = s.rows.length - okRows.length;
  const byShop = new Map();
  for (const r of okRows) {
    const c = plan?.assign.get(r.id);
    if (c) byShop.set(c.shop, [...(byShop.get(c.shop) || []), { row: r, line: r.line, product: c }]);
  }
  const canFill = ([k, es]) => cartShop(k) && es.some(e => e.product.cart);
  const baskets = [...byShop].sort((a, b) => canFill(b) - canFill(a) || b[1].length - a[1].length);
  const notes = [waiting && `${plural(waiting, "part")} still being priced`, missing && `${plural(missing, "part")} not counted`].filter(Boolean);
  return (
    <aside class="l-order" id="order" aria-label="Order">
      <div class={`l-panel${empty ? " has-overlay" : ""}`}>
        {empty ? <div class="l-overlay">No parts yet. Type or paste them in the box.</div> : null}
        <h2>How to buy</h2>
        <Strategies s={s} plans={plans} strategy={strategy} />
        <div class="l-total num">{plan ? money(plan.total) : "—"}</div>
        <div class="l-total-sub num">
          {plan ? `${money(plan.parts)} parts + ~${money(plan.delivery)} delivery from ${plural(plan.used.size, "shop")}` : "Nothing to buy yet"}
          {notes.length ? ` · ${notes.join(" · ")}` : ""}
        </div>
      </div>
      <div class={`l-panel l-fees${empty ? " has-overlay" : ""}`}>
        {empty ? <div class="l-overlay">Add parts first, then set delivery fees here.</div> : null}
        <h2>Delivery fees</h2>
        <Fees s={s} used={plan?.used || new Set()} />
      </div>
      <div class="l-panel">
        <h2>Your order{byShop.size ? ` · ${plural(byShop.size, "shop")}` : ""}</h2>
        {baskets.length
          ? baskets.map(([k, es]) => <Basket key={k} shop={k} entries={es} filling={s.filling} />)
          : <p class="l-muted">{empty ? "Add parts to see the order." : "Nothing to order yet."}</p>}
      </div>
    </aside>
  );
}

// changing a row's name or quantity; a new name searches every shop for that part again, while
// the dialog stays open and counts the shops
function ChangeDialog({ r }) {
  const dialog = useRef(null);
  const name = useRef(null);
  const qty = useRef(null);
  const [busy, setBusy] = useState(null); // { name, done } while searching
  const [error, setError] = useState("");
  const search = useRef(null);
  useEffect(() => {
    if (!r) return;
    name.current.value = r.query;
    qty.current.value = r.qty;
    setError("");
    setBusy(null);
    dialog.current.showModal();
    name.current.select();
  }, [r?.id]);
  const submit = async e => {
    e.preventDefault();
    const q = name.current.value.replace(/\s+/g, " ").trim();
    const n = Math.max(1, Math.min(9999, parseInt(qty.current.value, 10) || 1));
    if (q.length < 2) { setError("Type at least two characters."); name.current.focus(); return; }
    if (q === r.query) {
      dialog.current.close();
      if (n !== r.qty) setQty(r.id, n);
      return;
    }
    const ctl = search.current = new AbortController();
    setError("");
    setBusy({ name: q, done: 0 });
    try {
      const result = await searchAll(q, { cancel: ctl.signal, onProgress: done => ctl === search.current && setBusy({ name: q, done }) });
      if (ctl !== search.current || ctl.signal.aborted) return;
      setBusy(null);
      if (!rowById(r.id)) { dialog.current.close(); return; }
      const next = withResult({ ...rowById(r.id), query: q, qty: n, pinKey: null }, result);
      if (!next.line.candidates.length) {
        setError(`No shop has “${q}” in stock. Try another name or a part number.`);
        name.current.select();
        return;
      }
      cancels.get(r.id)?.abort();
      dialog.current.close();
      change(s => ({ rows: s.rows.map(x => (x.id === r.id ? next : x)), filters: { ...s.filters, [r.id]: "" } }), r.id);
      flashRows([r.id]);
      toast(`Changed to “${q}”`);
    } catch (err) {
      if (ctl !== search.current) return;
      setBusy(null);
      setError(err.message);
    }
  };
  // closing stops a search still running
  const onClose = () => {
    search.current?.abort();
    search.current = null;
    set({ editing: null });
    requestAnimationFrame(() => document.querySelector(`[data-row="${r?.id}"] summary`)?.focus());
  };
  return (
    <dialog class="modal l-dialog" ref={dialog} aria-labelledby="l-change-title" onClose={onClose}
      onClick={e => { if (onBackdrop(e)) dialog.current.close(); }}>
      <form onSubmit={submit}>
        <h2 id="l-change-title">Change part</h2>
        <label class="modal-label" for="l-change-name">Name or part number</label>
        <input type="text" id="l-change-name" ref={name} maxlength="200" autocomplete="off" spellcheck={false} disabled={!!busy}
          data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" />
        <label class="modal-label" for="l-change-qty">Quantity</label>
        <input type="number" id="l-change-qty" ref={qty} min="1" max="9999" inputmode="numeric" disabled={!!busy} />
        <p class="l-dlg-hint">A new name searches every shop again, for this part only.</p>
        {error ? <p class="l-dlg-error" role="alert">{error}</p> : null}
        {busy ? <div class="l-dlg-status" role="status"><span class="l-bar-anim" />Searching for “{busy.name}”… {busy.done} of {SHOPS.length} shops</div> : null}
        <div class="modal-actions">
          <button type="button" class="btn" onClick={() => dialog.current.close()}>Cancel</button>
          <button type="submit" class="btn primary" disabled={!!busy}>{busy ? "Searching…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
}

function ListApp() {
  const s = store.use();
  const { plans, strategy, plan } = plansNow();
  const found = s.rows.filter(r => plan?.assign.has(r.id)).length;
  return <>
    <Head s={s} />
    <ShopsStatus s={s} />
    <div class="l-layout">
      <div class="l-list-wrap" role="region" aria-label="Parts">
        <div class="l-list">
          <Intake />
          {s.rows.length
            ? <div class="l-cols" aria-hidden="true"><span>Qty</span><span>Part · what you'd buy</span><span>Cost</span><span /></div>
            : null}
          {s.rows.map(r => <Row key={r.id} r={r} s={s} plan={plan} />)}
        </div>
      </div>
      <Order s={s} plans={plans} strategy={strategy} plan={plan} />
    </div>
    {s.rows.length
      ? <div class="l-mobile-bar">
          <div>
            <div class="t num">{plan ? money(plan.total) : "—"}</div>
            <div class="s">{plural(found, "part")} · {plural(plan?.used.size || 0, "shop")} · delivery incl.</div>
          </div>
          <button class="btn primary" type="button" onClick={() => $("#order").scrollIntoView({ behavior: "smooth" })}>View order</button>
        </div>
      : null}
    <ChangeDialog r={s.editing != null ? rowById(s.editing) : null} />
  </>;
}

render(<ListApp />, $("#list-app"));

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Pricing the rows: each searched at every shop, a few at a time, and the shops that failed
// asked again.

import { SHOPS_BY_KEY } from "../../shops.js";
import { searchAll, fetchShop, mergeShop } from "../../search.js";
import { priced, unpriced, pendingShops, withResult } from "../../list-model.js";
import { toast, announce } from "../common.js";
import { plural } from "../format.js";
import { store, set, change, flashRows, rowById } from "./state.js";

const AT_ONCE = 4; // parts searched at the same time, to be gentle with the shops
// A part shows its prices once all but this many shops have answered, and the next part starts.
// The slow ones are added as they answer, so one shop taking its time doesn't hold up the list.
const LATE = 3;

let listRun = 0;             // bumped when another list is opened, so pricing for the old one stops
const queue = [];            // rows waiting to be searched: { id, run }
const cancels = new Map();   // row id -> AbortController, for a row removed while it searches
let active = 0;

// a row already waiting in the queue, or being searched, isn't searched twice
const searching = id => cancels.has(id) && !cancels.get(id).signal.aborted;
export function price(ids) {
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
    let freed = false;
    const free = () => {
      if (freed) return;
      freed = true;
      active--;
      pump();
      if (!active && !queue.length && store.state.rows.length) announce(`Priced ${plural(store.state.rows.filter(priced).length, "part")}`);
    };
    priceRow(r, job.run, free).finally(free);
  }
}
// `free` lets the next part start: once this one shows its prices
async function priceRow(r, run, free) {
  const ctl = new AbortController();
  cancels.set(r.id, ctl);
  const setRow = patch => set(s => ({ rows: s.rows.map(x => (x.id === r.id ? { ...x, ...patch } : x)) }));
  // removed, changed to another part or another list opened meanwhile
  const gone = () => run !== listRun || ctl.signal.aborted || rowById(r.id)?.query !== r.query;
  // other rows may move to another shop once this one is priced; they light up, without a message
  const show = result => change(s => ({ rows: s.rows.map(x => (x.id === r.id ? withResult(x, result) : x)) }));
  let shown = false;
  setRow({ status: "searching", done: 0, error: "" });
  try {
    const result = await searchAll(r.query, {
      cancel: ctl.signal,
      onProgress: (done, total, partial) => {
        if (gone()) return;
        if (shown) show(partial); // a slow shop answered
        else if (total - done <= LATE) { shown = true; show(partial); flashRows([r.id]); free(); }
        else setRow({ done });
      },
    });
    if (gone()) return;
    show(result);
    if (!shown) flashRows([r.id]);
  } catch (e) {
    if (!gone() && !shown) setRow({ status: "error", error: e.message });
  } finally {
    if (cancels.get(r.id) === ctl) cancels.delete(r.id);
  }
}

// stops a row's search, when it's removed or changed to another part
export const stopRow = id => cancels.get(id)?.abort();

// stops everything for the list on the tab, when another one takes its place; returns the new run
export function stopAll() {
  listRun++;
  queue.length = 0;
  for (const c of cancels.values()) c.abort();
  cancels.clear();
  return listRun;
}
export const currentRun = () => listRun;

// called when a tab is shown: a list kept from the last visit is priced once it's looked at
export function listTabShown() {
  const waiting = store.state.rows.filter(r => r.status === "waiting");
  if (waiting.length) price(waiting.map(r => r.id));
}

// the shops that failed, for any part
export function failedShops() {
  const failed = new Map();
  for (const r of store.state.rows) if (priced(r)) for (const s of r.result.shops) if (!s.ok && !s.pending) failed.set(s.key, s);
  return [...failed.values()];
}

// how far pricing has got: parts settled (priced, or failed) of all, the shops still to answer
// for parts already showing prices, and whether the total is final
export function progress() {
  const n = store.state.rows.length;
  const settled = store.state.rows.filter(r => !unpriced(r)).length;
  const late = lateShops();
  return { n, settled, late, final: settled === n && !late.length };
}

// the shops some part is still waiting for, having shown its prices without them
export function lateShops() {
  const late = new Map();
  for (const r of store.state.rows) for (const s of pendingShops(r)) late.set(s.key, s);
  return [...late.values()];
}

// asks the shops that failed again, for each part they failed on, and merges in what they answer
export async function retryShops() {
  const run = listRun;
  const failed = failedShops().map(s => s.key);
  const jobs = [];
  for (const r of store.state.rows) {
    if (!priced(r)) continue;
    for (const s of r.result.shops) if (!s.ok && !s.pending && !jobs.some(j => j.query === r.query && j.key === s.key)) jobs.push({ query: r.query, key: s.key });
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

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Search tab's state and searching: the search box and its shop picker, the address bar's
// ?q= and ?shop=, recent searches, and asking shops again.

import { searchAll, searchKey, fetchShop, mergeShop } from "../../search.js";
import { SHOPS, SHOPS_BY_KEY } from "../../shops.js";
import { STRONG } from "../../matching.js";
import { $, toast, announce } from "../common.js";
import { plural } from "../format.js";
import { loadJSON, saveJSON } from "../storage.js";
import { createStore } from "../store.js";
import { setUpShopPick, pickShop, pickedShop } from "./shop-pick.js";

const SITE_TITLE = "Egypt Electronics Parts Search";
const PAGE_TITLE = document.title;
const SHOW_AFTER = 3; // shops answered before the first results show, so it doesn't open on "no matches"

export const store = createStore({
  query: "",          // what the tab is showing, mirrored into ?q=
  only: "",           // the one shop it was searched at, mirrored into ?shop=; "" for every shop
  result: null,       // the search as it is now, growing as shops answer
  shown: false,       // enough shops answered to show results
  error: "",
  fetching: new Set(), // shops being asked again, after failing or being skipped
  flash: "",          // a shop whose results just came in
  sort: "match",
  view: "flat",       // every offer; "group" puts each product's offers in one card
  hidden: new Set(),  // shops unticked in the filters
  saleOnly: false,
  cartOnly: false,
  openKeys: new Set(), // the offers in the product cards that are open
  showFilters: false, // the filter panel, on narrow screens
  recent: loadJSON("recent", []),
  tick: 0,            // bumped when something outside the tab changed, like a star
});
export const { set } = store;

/* ---------- recent searches, kept in this browser ---------- */

export function setRecent(recent) {
  saveJSON("recent", recent);
  set({ recent });
}
const addRecent = q => setRecent([q, ...store.state.recent.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 6));

/* ---------- searching ---------- */

let searchRun = 0;        // bumped by each search and by clearing, so a stale result is dropped
let cancelSearch = null;  // stops the shops a replaced search is still waiting for
let stopWaiting = null;   // skips the shops the shown search is still waiting for
let pendingQuery = "";    // ?q= from a shared link, waiting for the search tab

// the shop picked in the search box, or "" for every shop
const picked = () => pickedShop();

// a search puts ?q= (and ?shop=, at one shop) in the address bar, so the results can be linked
// to and shared
function setSearchUrl(q, only = store.state.only) {
  const url = new URL(location.href);
  if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
  if (q && only) url.searchParams.set("shop", only); else url.searchParams.delete("shop");
  // #search is the default tab, so it is left out of the address bar
  const hash = url.hash === "#search" ? "" : url.hash;
  history.replaceState(null, "", url.pathname + url.search + hash);
  document.title = q ? `${q} · ${SITE_TITLE}` : PAGE_TITLE;
}

// called when a tab is shown. A shared ?q= link that opens on another tab waits until the
// search tab is shown; ?q= belongs to the search tab, so the other tabs keep it out of the
// address bar.
export function searchTabShown(shown) {
  if (shown && pendingQuery) {
    const q = pendingQuery;
    pendingQuery = "";
    runSearch(q);
    return;
  }
  setSearchUrl(shown ? store.state.query : "");
  // a star may have changed on the Saved tab meanwhile
  if (shown) set({ tick: store.state.tick + 1 });
}

// searches from another tab, at every shop: goes to this one, which runs it
export function searchFor(q) {
  pendingQuery = q;
  $("#q").value = q;
  pick("");
  if (location.hash === "#search" || !location.hash) searchTabShown(true);
  else location.hash = "#search";
}

export async function runSearch(q) {
  q = q.trim();
  if (q.length < 2) return;
  const only = picked();
  // searching again for what's on screen asks the shops again, rather than showing the same answer
  const fresh = !!store.state.result && searchKey(q) === searchKey(store.state.query) && only === store.state.only;
  $("#q").value = q;
  updateBox();
  setSearchUrl(q, only);
  addRecent(q);
  cancelSearch?.abort();
  const cancel = cancelSearch = new AbortController();
  const skip = new AbortController();
  stopWaiting = () => skip.abort();
  const run = ++searchRun;
  set({
    query: q, only, result: null, shown: false, error: "", fetching: new Set(), flash: "",
    hidden: new Set(), saleOnly: false, cartOnly: false, openKeys: new Set(), showFilters: false,
  });
  // the results show once a few shops have answered with a match, then each shop joins them as it answers
  const onProgress = (done, total, partial) => {
    if (run !== searchRun) return;
    const shown = store.state.shown || done >= total || (done >= SHOW_AFTER && partial.results.some(r => r.score >= STRONG));
    set({ result: partial, shown });
  };
  try {
    const result = await searchAll(q, { onProgress, skip: skip.signal, cancel: cancel.signal, fresh, shops: only ? [only] : null });
    if (run !== searchRun) return;
    set({ result, shown: true });
    const n = result.results.filter(r => r.score >= STRONG).length;
    announce(`${plural(n, "match", "matches")} for ${q}`);
  } catch (e) {
    if (run === searchRun) set({ error: e.message });
  }
}

// skips the shops the search is still waiting for
export const skipWaiting = () => stopWaiting?.();

// the search shown, at every shop: asks the ones it wasn't searched at, keeping what's in
export function searchEverywhere() {
  pick("");
  // still waiting for the shop it's searched at: simpler to search every shop from the start
  if (store.state.result?.shops.some(x => x.pending) || !store.state.result) return runSearch(store.state.query);
  set({ only: "" });
  setSearchUrl(store.state.query, "");
  for (const x of store.state.result?.shops || []) if (x.unasked && !store.state.fetching.has(x.key)) askAgain(x.key);
}

// empties the box and the results, bringing back the intro
function clearSearch() {
  searchRun++;
  cancelSearch?.abort();
  $("#q").value = "";
  updateBox();
  setSearchUrl("");
  set({ query: "", only: "", result: null, shown: false, error: "" });
}

// asks one shop again: one that failed, or one skipped by "Stop waiting"
export async function askAgain(shopKey) {
  const run = searchRun;
  set(s => ({ fetching: new Set([...s.fetching, shopKey]) }));
  let fetched = null;
  try {
    fetched = await fetchShop(store.state.query, shopKey);
  } catch (e) {
    toast(e.message);
  }
  // a new search may have replaced this one meanwhile
  if (run !== searchRun) return;
  const fetching = new Set(store.state.fetching);
  fetching.delete(shopKey);
  if (!fetched) return set({ fetching });
  if (!fetched.status.ok) toast(`${fetched.status.name} didn't answer again`);
  // merged into the result as it is now, which may already hold other shops fetched meanwhile
  set({ fetching, result: mergeShop(store.state.result, fetched), flash: fetched.status.ok ? shopKey : "" });
  setTimeout(() => { if (store.state.flash === shopKey) set({ flash: "" }); }, 1500);
}

/* ---------- the search box, which is in the page rather than the tab ---------- */

const pick = pickShop;

// the × shows while there is something to clear, and Search while there is something to search
// for; the "/" hint shows while the box is idle and empty
function updateBox() {
  const q = $("#q");
  $("#q-clear").hidden = !q.value;
  $("#q-go").disabled = !q.value.trim();
  $("#slash").hidden = !!q.value || document.activeElement === q || matchMedia("(hover: none)").matches;
}

export function setUpSearchBox() {
  // the box's text and its × stay clear of the picker, however wide the shop's name makes it
  new ResizeObserver(() => $(".s-field").style.setProperty("--pill", `${$("#q-shop").offsetWidth + 8}px`)).observe($("#q-shop"));
  // with results showing, picking a shop searches it; picking every shop asks the rest
  setUpShopPick(shopKey => {
    const q = store.state.query;
    if (!q) return;
    if (shopKey) runSearch(q);
    else searchEverywhere();
  });
  $("#search-form").addEventListener("submit", e => {
    e.preventDefault();
    runSearch($("#q").value);
    $("#q").blur();
  });
  for (const type of ["input", "focus", "blur"]) $("#q").addEventListener(type, updateBox);
  // Escape in the box clears it too (the browser's own "search" event)
  $("#q").addEventListener("search", e => { if (!e.target.value.trim()) clearSearch(); });
  $("#q-clear").addEventListener("click", () => { clearSearch(); $("#q").focus(); });
  // "/" jumps to the search box from anywhere on the search tab
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (!$("#tab-search").classList.contains("active")) return;
    e.preventDefault();
    $("#q").focus();
    $("#q").select();
  });

  // opened with a shared link? fill the box, and run it as soon as the search tab is shown
  const params = new URLSearchParams(location.search);
  pick(params.get("shop") || "");
  const sharedQuery = (params.get("q") || "").trim();
  if (sharedQuery) {
    $("#q").value = sharedQuery;
    pendingQuery = sharedQuery;
  }
  updateBox();
}

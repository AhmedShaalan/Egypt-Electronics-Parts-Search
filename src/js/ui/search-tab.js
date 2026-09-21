// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Search tab: one part searched at every shop, the results shown as the shops answer.

import { SHOPS } from "../shops.js";
import { searchAll, fetchShop, mergeShop } from "../search.js";
import { STRONG } from "../matching.js";
import { $, esc, money, toast, announce, key, thumb, packNote, safeUrl, loadingHtml, setProgress } from "./common.js";
import { COPY_FORMATS, copy, copyText, copyMenu } from "./copy.js";
import { CART_ICON, cartLink } from "./cart.js";
import { isSaved, toggleSave } from "./saved.js";
import { openAddToList } from "./add-to-list.js";

let search = null;          // last search response
let searchRun = 0;          // bumped by each search and by clearing, so a stale result is dropped
let showWeak = false;
let shopFilter = "";        // shop key picked from the chips, "" = all shops
let pendingQuery = "";      // ?q= from a shared link, waiting for the search tab
let currentQuery = "";      // what the search tab is showing, mirrored into ?q=

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
  setSearchUrl(shown ? currentQuery : "");
}

$("#search-form").addEventListener("submit", e => {
  e.preventDefault();
  runSearch($("#q").value);
});

// a search puts ?q= in the address bar, so the results can be linked to and shared
const SITE_TITLE = "Egypt Electronics Parts Search";
const PAGE_TITLE = document.title;

function setSearchUrl(q) {
  if (q) currentQuery = q;
  const url = new URL(location.href);
  if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
  // #search is the default tab, so it is left out of the address bar
  const hash = url.hash === "#search" ? "" : url.hash;
  history.replaceState(null, "", url.pathname + url.search + hash);
  document.title = q ? `${q} · ${SITE_TITLE}` : PAGE_TITLE;
}

let cancelSearch = null; // stops the shops a replaced search is still waiting for
let stopWaiting = null;  // skips the shops the shown search is still waiting for
const SHOW_AFTER = 3;    // shops answered before the first results show
let updateWaiting = false; // an update held back while a copy menu is open

// shows `search` as it now is, unless the reader has a copy menu open: redrawing would close
// it, so the update waits until the menu closes
function updateSearch() {
  updateWaiting = !!$("#search-out").querySelector("details[open]");
  if (!updateWaiting) renderSearch();
}
$("#search-out").addEventListener("toggle", (e) => {
  if (updateWaiting && !e.target.open && search) updateSearch();
}, true);

// the control that has focus, found again after a redraw
function focusedSelector(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return null;
  for (const a of ["data-shop", "data-save", "data-add-list"]) if (el.hasAttribute(a)) return `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
  return el.id ? `#${CSS.escape(el.id)}` : null;
}

async function runSearch(q) {
  q = q.trim();
  if (q.length < 2) return;
  setSearchUrl(q);
  cancelSearch?.abort();
  const cancel = cancelSearch = new AbortController();
  fetching.clear();
  const out = $("#search-out");
  out.innerHTML = loadingHtml(`Searching all shops for “${esc(q)}”…`, SHOPS.length, "shops", true);
  const progress = out.querySelector(".progress");
  const skip = new AbortController();
  out.querySelector(".skip").onclick = (e) => {
    e.target.disabled = true;
    e.target.textContent = "Finishing…";
    skip.abort();
  };
  showWeak = false;
  shopFilter = "";
  const run = ++searchRun;
  stopWaiting = () => skip.abort();
  // the results show once a few shops have answered with a match, then each shop joins them as
  // it answers; until then the progress bar stays, rather than an early "no matches"
  let shown = false;
  const onProgress = (done, total, partial) => {
    if (run !== searchRun) return;
    shown ||= done >= total || (done >= SHOW_AFTER && partial.results.some(r => r.score >= STRONG));
    if (!shown) return setProgress(progress, done, total, "shops");
    search = partial;
    updateSearch();
  };
  try {
    const result = await searchAll(q, { onProgress, skip: skip.signal, cancel: cancel.signal });
    if (run !== searchRun) return;
    search = result;
    updateSearch();
    const n = result.results.filter(r => r.score >= STRONG).length;
    announce(`${n} match${n === 1 ? "" : "es"} for ${q}`);
  } catch (e) {
    if (run === searchRun) out.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

// empties the box and the results, bringing back the intro underneath
function clearSearch() {
  searchRun++;
  cancelSearch?.abort();
  search = null;
  $("#q").value = "";
  $("#search-out").innerHTML = "";
  currentQuery = "";
  setSearchUrl("");
  updateClear();
}

const fetching = new Set(); // shop keys being fetched after a skip

async function fetchSkipped(key) {
  const run = searchRun;
  fetching.add(key);
  renderSearch();
  let fetched = null;
  try {
    fetched = await fetchShop(search.query, key);
  } catch (e) {
    toast(e.message);
  }
  // a new search may have replaced this one meanwhile
  if (run !== searchRun) return;
  fetching.delete(key);
  // merged into the result as it is now, which may already hold other shops fetched meanwhile
  if (fetched) search = mergeShop(search, fetched);
  renderSearch();
}

function renderSearch() {
  const out = $("#search-out");
  const focused = focusedSelector(out);
  const sort = $("#sort")?.value || "match";
  const shop = shopFilter;
  let rows = search.results.filter(r => !shop || r.shop === shop);
  const sorters = {
    price: (a, b) => a.price - b.price,
    unit: (a, b) => a.unit_price - b.unit_price,
    match: (a, b) => b.score - a.score || a.price - b.price,
  };
  rows.sort(sorters[sort]);
  const strong = rows.filter(r => r.score >= STRONG);
  const weak = rows.filter(r => r.score < STRONG);

  const chip = (key, label, { count, disabled = false, fail = false, skipped = false, fetching = false, title = "" } = {}) => `
    <button type="button" class="chip filter${fail ? " fail" : ""}${skipped ? " skipped" : ""}${shop === key ? " active" : ""}" data-shop="${esc(key)}"
      ${skipped ? `data-fetch="${esc(key)}"` : fail ? `data-fail aria-disabled="true"` : `aria-pressed="${shop === key}"`} ${disabled || fetching ? "disabled" : ""} ${title ? `title="${esc(title)}"` : ""}>${esc(label)}${
        count === undefined ? "" : ` · ${count}`}${
        skipped ? (fetching ? " · fetching…" : `<span class="idle"> · skipped</span><span class="on-hover"> · Fetch now</span>`) : ""}</button>`;
  // counts match the "N matches" line: real matches only; a shop with only weaker matches stays clickable
  const matchCount = key => search.results.filter(r => r.score >= STRONG && (!key || r.shop === key)).length;
  // "All shops" first, then the shops A to Z
  const byName = [...search.shops].sort((a, b) => a.name.localeCompare(b.name));
  const chips = chip("", "All shops", { count: matchCount("") }) + byName.map(s => s.ok
    ? chip(s.key, s.name, { count: matchCount(s.key), disabled: !s.count })
    : s.pending
      ? chip(s.key, s.name + " · …", { disabled: true, title: "Still searching this shop" })
    : s.skipped
      ? chip(s.key, s.name, { skipped: true, fetching: fetching.has(s.key), title: "Not searched: you chose to show results early. Click to search it now." })
      : chip(s.key, s.name + " · failed", { fail: true, title: s.error })).join("");
  const shopName = shop && search.shops.find(s => s.key === shop)?.name;
  const skipped = search.shops.filter(s => s.skipped).length;
  const waiting = search.shops.filter(s => s.pending).length;

  out.innerHTML = `
    <div class="chips" role="group" aria-label="Filter by shop">${chips}</div>
    <div class="toolbar">
      <span class="grow">${strong.length} match${strong.length === 1 ? "" : "es"}${shopName ? ` at ${esc(shopName)}` : ""}${search.cached ? " · from the last hour" : ""}${waiting ? ` · searching ${waiting} more shop${waiting === 1 ? "" : "s"}… <a href="#" id="stop-waiting">stop</a>` : ""}${skipped ? ` · ${skipped} shop${skipped === 1 ? "" : "s"} skipped, <a href="#" id="search-all">search them too</a>` : ""}</span>
      <select id="sort" aria-label="Sort">
        <option value="match" ${sort === "match" ? "selected" : ""}>Best match, then cheapest</option>
        <option value="price" ${sort === "price" ? "selected" : ""}>Cheapest</option>
        <option value="unit" ${sort === "unit" ? "selected" : ""}>Cheapest per piece</option>
      </select>
    </div>
    ${strong.length ? `<div class="list">${strong.map(resultRow).join("")}</div>` : `<div class="empty">${waiting ? "No in-stock matches yet." : "No in-stock matches."}${weak.length ? " There are some weaker matches below." : ""}</div>`}
    ${weak.length ? (showWeak
      ? `<h2>Weaker matches</h2><div class="list">${weak.map(resultRow).join("")}</div>`
      : `<button class="btn more" id="show-weak">Show ${weak.length} weaker match${weak.length === 1 ? "" : "es"}</button>`) : ""}
  `;
  $("#sort").onchange = renderSearch;
  $("#search-all")?.addEventListener("click", (e) => { e.preventDefault(); runSearch(search.query); });
  $("#stop-waiting")?.addEventListener("click", (e) => { e.preventDefault(); stopWaiting?.(); });
  out.querySelectorAll(".chip[data-fetch]").forEach(btn => { btn.onclick = () => fetchSkipped(btn.dataset.fetch); });
  // a failed shop can't be filtered to, but a click says why it failed
  out.querySelectorAll(".chip[data-fail]").forEach(btn => { btn.onclick = () => toast(`${btn.textContent.trim()}: ${btn.title}`); });
  out.querySelectorAll(".chip.filter:not([data-fetch]):not([data-fail])").forEach(btn => {
    btn.onclick = () => {
      // clicking the active shop again goes back to all shops
      shopFilter = btn.dataset.shop === shopFilter ? "" : btn.dataset.shop;
      showWeak = false;
      renderSearch();
    };
  });
  $("#show-weak")?.addEventListener("click", () => { showWeak = true; renderSearch(); });
  if (focused) out.querySelector(focused)?.focus({ preventScroll: true });
  out.querySelectorAll("[data-save]").forEach(btn => {
    btn.onclick = () => toggleSave(search.results.find(r => key(r) === btn.dataset.save), btn);
  });
  out.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    b.closest("details").open = false;
    copy(copyText(search.results.filter(r => key(r) === b.dataset.item), COPY_FORMATS[+b.dataset.copy]));
  });
  out.querySelectorAll("[data-add-list]").forEach(b => {
    b.onclick = () => openAddToList(search.results.find(r => key(r) === b.dataset.addList));
  });
}

function resultRow(p) {
  const saved = isSaved(p);
  return `
    <div class="row">
      ${thumb(p)}
      <div>
        <a class="name" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener">${esc(p.name)}</a>
        <div class="meta">${esc(p.shop_name)}${p.old_price ? ' · <span class="badge sale">Sale</span>' : ""}${p.pack > 1 ? ` · pack of ${p.pack}` : ""}</div>
      </div>
      <div class="actions">
        <div class="price"><b>${money(p.price)}</b>${p.old_price ? `<s>${money(p.old_price)}</s>` : ""}${packNote(p)}</div>
        <span class="reveal">
          ${copyMenu("Copy this item", key(p))}
          ${cartLink(p) ? `<a class="icon-btn" href="${esc(cartLink(p))}" target="_blank" rel="noopener" title="Add to cart at ${esc(p.shop_name)}" aria-label="Add to cart at ${esc(p.shop_name)}">${CART_ICON}</a>` : ""}
          <button type="button" class="icon-btn" data-add-list="${esc(key(p))}" title="Add to a parts list" aria-label="Add to a parts list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11M3 12h11M3 18h7M18 14v8M14 18h8"/></svg>
          </button>
          <button type="button" class="icon-btn save${saved ? " on" : ""}" data-save="${esc(key(p))}" title="${saved ? "Remove from saved" : "Save"}" aria-label="${saved ? "Remove from saved" : "Save"}" aria-pressed="${saved}">
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>
          </button>
        </span>
      </div>
    </div>`;
}

// Escape in the box clears it too (the browser's own "search" event)
$("#q").addEventListener("search", e => { if (!e.target.value.trim()) clearSearch(); });

// the × in the search box only shows while there is something to clear
function updateClear() { $("#q-clear").hidden = !$("#q").value; }
$("#q").addEventListener("input", updateClear);
$("#q-clear").addEventListener("click", () => {
  clearSearch();
  $("#q").focus();
});

// opened with a shared link? fill the box, and run it as soon as the search tab is shown
const sharedQuery = (new URLSearchParams(location.search).get("q") || "").trim();
if (sharedQuery) {
  $("#q").value = sharedQuery;
  pendingQuery = sharedQuery;
}
updateClear();

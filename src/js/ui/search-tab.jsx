// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Search tab: one part searched at every shop. Results fill in as the shops answer, the same
// product at different shops is one card, and a side panel filters by shop.

import { render } from "preact";
import { useEffect, useReducer } from "preact/hooks";
import { SHOPS } from "../shops.js";
import { searchAll, fetchShop, mergeShop } from "../search.js";
import { STRONG, weakReason } from "../matching.js";
import { groupOffers } from "../grouping.js";
import { $, money, toast, announce, key, safeUrl } from "./common.js";
import { COPY_FORMATS, copy, copyText } from "./copy.js";
import { cartLink } from "./cart.js";
import { isSaved, toggleSave } from "./saved.js";
import { openAddToList, addToLastList, lastList } from "./add-to-list.js";
import { createStore } from "./store.js";

const SITE_TITLE = "Egypt Electronics Parts Search";
const PAGE_TITLE = document.title;
const SHOW_AFTER = 3; // shops answered before the first results show, so it doesn't open on "no matches"
const EXAMPLES = ["LM7805", "ESP32", "10k resistor"];
const RECENT_KEY = "egypt-parts-search:recent";

/* ---------- state ---------- */

const store = createStore({
  query: "",          // what the tab is showing, mirrored into ?q=
  result: null,       // the search as it is now, growing as shops answer
  shown: false,       // enough shops answered to show results
  error: "",
  fetching: new Set(), // shops being asked again, after failing or being skipped
  flash: "",          // a shop whose results just came in
  sort: "match",
  view: "group",
  hidden: new Set(),  // shops unticked in the filters
  saleOnly: false,
  cartOnly: false,
  openKeys: new Set(), // the offers in the product cards that are open
  showFilters: false, // the filter panel, on narrow screens
  recent: loadRecent(),
  tick: 0,            // bumped when something outside the tab changed, like a star
});
const { set } = store;

/* ---------- recent searches, kept in this browser ---------- */

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function setRecent(recent) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode: kept for this visit only */ }
  set({ recent });
}
const addRecent = q => setRecent([q, ...store.state.recent.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 6));

/* ---------- searching ---------- */

let searchRun = 0;        // bumped by each search and by clearing, so a stale result is dropped
let cancelSearch = null;  // stops the shops a replaced search is still waiting for
let stopWaiting = null;   // skips the shops the shown search is still waiting for
let pendingQuery = "";    // ?q= from a shared link, waiting for the search tab

// a search puts ?q= in the address bar, so the results can be linked to and shared
function setSearchUrl(q) {
  const url = new URL(location.href);
  if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
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

// searches from another tab: goes to this one, which runs it
export function searchFor(q) {
  pendingQuery = q;
  $("#q").value = q;
  if (location.hash === "#search" || !location.hash) searchTabShown(true);
  else location.hash = "#search";
}

async function runSearch(q) {
  q = q.trim();
  if (q.length < 2) return;
  $("#q").value = q;
  updateBox();
  setSearchUrl(q);
  addRecent(q);
  cancelSearch?.abort();
  const cancel = cancelSearch = new AbortController();
  const skip = new AbortController();
  stopWaiting = () => skip.abort();
  const run = ++searchRun;
  set({
    query: q, result: null, shown: false, error: "", fetching: new Set(), flash: "",
    hidden: new Set(), saleOnly: false, cartOnly: false, openKeys: new Set(), showFilters: false,
  });
  // the results show once a few shops have answered with a match, then each shop joins them as it answers
  const onProgress = (done, total, partial) => {
    if (run !== searchRun) return;
    const shown = store.state.shown || done >= total || (done >= SHOW_AFTER && partial.results.some(r => r.score >= STRONG));
    set({ result: partial, shown });
  };
  try {
    const result = await searchAll(q, { onProgress, skip: skip.signal, cancel: cancel.signal });
    if (run !== searchRun) return;
    set({ result, shown: true });
    const n = result.results.filter(r => r.score >= STRONG).length;
    announce(`${n} match${n === 1 ? "" : "es"} for ${q}`);
  } catch (e) {
    if (run === searchRun) set({ error: e.message });
  }
}

// empties the box and the results, bringing back the intro
function clearSearch() {
  searchRun++;
  cancelSearch?.abort();
  $("#q").value = "";
  updateBox();
  setSearchUrl("");
  set({ query: "", result: null, shown: false, error: "" });
}

// asks one shop again: one that failed, or one skipped by "Stop waiting"
async function askAgain(shopKey) {
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

/* ---------- what the results show ---------- */

const priceKey = (p, sort) => sort === "unit" ? p.unit_price : p.price;
const canCart = p => !!cartLink(p);
const num = n => money(n).replace(" EGP", "");
const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

function view(s) {
  const r = s.result;
  const shops = r ? r.shops : SHOPS.map(x => ({ key: x.key, name: x.name, pending: true }));
  const all = r ? r.results : [];
  const strongAll = all.filter(p => p.score >= STRONG);
  const visible = all.filter(p => !s.hidden.has(p.shop) && (!s.saleOnly || p.old_price) && (!s.cartOnly || canCart(p)));
  const strong = visible.filter(p => p.score >= STRONG);
  const weak = visible.filter(p => p.score < STRONG);
  const busy = shops.some(x => x.pending);
  const answered = shops.filter(x => !x.pending).length;
  const matchCount = shopKey => strongAll.filter(p => p.shop === shopKey).length;
  return { shops, strongAll, strong, weak, busy, answered, matchCount };
}

function sortedGroups(query, offers, sort) {
  const byPrice = [...offers].sort((a, b) => priceKey(a, sort) - priceKey(b, sort));
  const groups = groupOffers(query, byPrice);
  const best = g => Math.max(...g.offers.map(o => o.score));
  if (sort === "match") groups.sort((a, b) => best(b) - best(a) || priceKey(a.offers[0], sort) - priceKey(b.offers[0], sort));
  return groups;
}

function sortedFlat(offers, sort) {
  return [...offers].sort(sort === "match"
    ? (a, b) => b.score - a.score || a.price - b.price
    : (a, b) => priceKey(a, sort) - priceKey(b, sort));
}

/* ---------- icons ---------- */

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
const CartIcon = () => <svg {...svg}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.9a1.5 1.5 0 0 0 1.5-1.1L21 7H6" /></svg>;
const StarIcon = () => <svg {...svg}><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" /></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
const ExtIcon = () => <svg {...svg}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const AddIcon = () => <svg {...svg}><path d="M3 6h11M3 12h11M3 18h7M18 14v8M14 18h8" /></svg>;
const ListsIcon = () => <svg {...svg}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const CopyIcon = () => <svg {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const Chevron = () => <svg class="s-chev" {...svg}><path d="m6 9 6 6 6-6" /></svg>;

/* ---------- pieces ---------- */

function Thumb({ p, big }) {
  const [failed, fail] = useReducer(() => true, false);
  const src = p.image && safeUrl(p.image) !== "#" && !failed ? p.image : null;
  const cls = `s-thumb${big ? " big" : ""}`;
  return src
    ? <img class={cls} src={src} alt="" loading="lazy" referrerpolicy="no-referrer" onError={fail} />
    : <span class={cls} />;
}

function Price({ p }) {
  return (
    <div class="s-price">
      <span class="s-price-main">{p.old_price ? <s>{num(p.old_price)}</s> : null}<b>{money(p.price)}</b></span>
      {p.pack > 1 && <small>pack of {p.pack} · {money(p.unit_price)} each</small>}
    </div>
  );
}

// a ⋯ menu; the arrow keys, Escape and clicking elsewhere are handled for every details.menu (copy.js)
function Menu({ label, children }) {
  const close = e => { e.currentTarget.closest("details").open = false; };
  return (
    <details class="menu right s-menu" onClick={e => e.target.closest('[role="menuitem"]') && close(e)}>
      <summary class="s-icon" title="More" aria-label={label}><DotsIcon /></summary>
      <div class="menu-list" role="menu">{children}</div>
    </details>
  );
}

function AddItems({ p }) {
  const last = lastList();
  return <>
    {last && <button type="button" role="menuitem" onClick={() => addToLastList(p)}><AddIcon /> Add to “{last.name}”</button>}
    <button type="button" role="menuitem" onClick={() => openAddToList(p)}><ListsIcon /> {last ? "Add to another list…" : "Add to a parts list…"}</button>
  </>;
}

function Offer({ p, mode, cheapest, reason }) {
  const saved = isSaved(p);
  const cart = cartLink(p);
  const url = safeUrl(p.url);
  const link = <a class="s-link" href={url} target="_blank" rel="noopener">{p.name}</a>;
  const chips = <>
    {cheapest && <span class="s-chip pick">Cheapest</span>}
    {p.old_price ? <span class="s-chip sale">Sale</span> : null}
    {reason && <span class="s-chip bad">{reason}</span>}
  </>;
  return (
    <div class={`s-offer${store.state.flash === p.shop ? " flash" : ""}`}>
      <Thumb p={p} />
      <div class="s-text">
        <div class="s-top">{mode === "shop" ? <><span class="s-shop">{p.shop_name}</span>{chips}</> : link}</div>
        <div class="s-sub">{mode === "shop" ? link : <><span class="s-shop-tag">{p.shop_name}</span>{chips}</>}</div>
      </div>
      <Price p={p} />
      <div class="s-acts">
        {cart
          ? <a class="s-icon" href={cart} target="_blank" rel="noopener" title={`Add to cart at ${p.shop_name}`} aria-label={`Add to cart at ${p.shop_name}`}><CartIcon /></a>
          : <span class="s-icon-space" />}
        <button type="button" class={`s-icon s-star${saved ? " on" : ""}`} aria-pressed={saved}
          title={saved ? "Remove from saved" : "Save"} aria-label={saved ? "Remove from saved" : "Save"}
          onClick={() => { toggleSave(p); set({ tick: store.state.tick + 1 }); }}><StarIcon /></button>
        <Menu label={`More for ${p.name}`}>
          <a role="menuitem" href={url} target="_blank" rel="noopener"><ExtIcon /> Open at {p.shop_name}</a>
          <AddItems p={p} />
          <hr />
          <button type="button" role="menuitem" onClick={() => copy(copyText([p], COPY_FORMATS[3]))}><CopyIcon /> Copy name, price and link</button>
        </Menu>
      </div>
    </div>
  );
}

function toggleGroup(g, open) {
  const openKeys = new Set(store.state.openKeys);
  for (const o of g.offers) open ? openKeys.add(key(o)) : openKeys.delete(key(o));
  set({ openKeys });
}

function copyGroup(g) {
  const lines = g.offers.map(o => `${o.shop_name}: ${money(o.price)}${o.pack > 1 ? ` (pack of ${o.pack})` : ""}\n${o.url}`);
  copy(`${g.seed.name}\n\n${lines.join("\n\n")}`);
}

function ProductCard({ g, sort }) {
  const best = g.offers[0];
  const n = g.offers.length;
  if (n === 1) return <article class="s-card single"><Offer p={best} mode="product" /></article>;
  // a card that was open stays open as more shops join it
  const open = g.offers.some(o => store.state.openKeys.has(key(o)));
  const shopCount = new Set(g.offers.map(o => o.shop)).size;
  const next = g.offers.slice(1, 4).map(o => `${o.shop_name} ${num(priceKey(o, sort))}`).join(" · ");
  const flash = g.offers.some(o => o.shop === store.state.flash);
  return (
    <article class={`s-card group${open ? " open" : ""}${flash ? " flash" : ""}`}>
      <div class="s-g-head">
        <button class="s-g-toggle" type="button" aria-expanded={open} onClick={() => toggleGroup(g, !open)}>
          <Thumb key={key(g.seed.image ? g.seed : best)} p={g.seed.image ? g.seed : best} big />
          <span class="s-g-text">
            <span class="s-g-name">{g.seed.name}</span>
            <span class="s-g-meta">
              <b>{shopCount === n ? plural(n, "shop") : `${n} offers at ${plural(shopCount, "shop")}`}</b>
              <span class="s-g-next"> · then {next}{n > 4 ? ` · ${n - 4} more` : ""}</span>
            </span>
          </span>
          <span class="s-g-price">
            <small>from</small>
            <b>{money(priceKey(best, sort))}</b>
            <small>{sort === "unit" && best.pack > 1 ? "each, " : ""}at {best.shop_name}</small>
          </span>
          <Chevron />
        </button>
        <div class="s-acts">
          <Menu label={`More for ${g.seed.name}`}>
            <AddItems p={g.seed} />
            <hr />
            <button type="button" role="menuitem" onClick={() => copyGroup(g)}><CopyIcon /> Copy all {n} offers</button>
          </Menu>
        </div>
      </div>
      {open && <div class="s-g-offers">{g.offers.map((o, i) => <Offer key={key(o)} p={o} mode="shop" cheapest={i === 0} />)}</div>}
    </article>
  );
}

function Status({ s, v }) {
  const total = v.shops.length;
  if (v.busy) {
    return (
      <div class="s-status">
        <span class="s-bar-anim" />
        <span>Searching {total} shops… <b>{v.answered}</b> answered</span>
        <button class="s-linkbtn" type="button" onClick={() => stopWaiting?.()}>Stop waiting</button>
      </div>
    );
  }
  const ok = v.shops.filter(x => x.ok).length;
  const failed = v.shops.filter(x => !x.ok && !x.skipped && !s.fetching.has(x.key));
  const skipped = v.shops.filter(x => x.skipped && !s.fetching.has(x.key));
  const asking = v.shops.filter(x => s.fetching.has(x.key));
  const minutes = s.result?.cached ? Math.round((Date.now() - Date.parse(s.result.searched_at)) / 60000) : 0;
  return (
    <div class="s-status">
      <span>Prices from <b>{ok} of {total} shops</b>, checked {minutes >= 1 ? `${plural(minutes, "minute")} ago` : "just now"}</span>
      {failed.map(x => <span key={x.key} class="s-status-item">
        <span class="s-fail" title={x.error}>{x.name} didn't answer</span>
        <button class="s-linkbtn" type="button" onClick={() => askAgain(x.key)}>Try again</button>
      </span>)}
      {asking.map(x => <span key={x.key}>Asking {x.name} again…</span>)}
      {skipped.length > 0 && <span class="s-status-item">
        <span>{skipped.length} skipped</span>
        <button class="s-linkbtn" type="button" onClick={() => skipped.forEach(x => askAgain(x.key))}>Search {skipped.length === 1 ? "it" : "them"} too</button>
      </span>}
      <button class="btn small s-share" type="button" title="Copy a link to these results" onClick={() => copy(location.href)}><CopyIcon /> Copy link</button>
    </div>
  );
}

function Filters({ s, v }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const withMatches = v.shops.filter(x => x.ok && v.matchCount(x.key)).sort(byName);
  const waiting = v.shops.filter(x => x.pending || s.fetching.has(x.key)).sort(byName);
  const problems = v.shops.filter(x => !x.ok && !x.pending && !s.fetching.has(x.key)).sort(byName);
  const none = v.shops.filter(x => x.ok && !v.matchCount(x.key) && !s.fetching.has(x.key)).sort(byName);
  const saleN = v.strongAll.filter(p => p.old_price).length;
  const cartN = v.strongAll.filter(canCart).length;
  const toggleShop = (shopKey, on) => {
    const hidden = new Set(s.hidden);
    on ? hidden.delete(shopKey) : hidden.add(shopKey);
    set({ hidden });
  };
  const only = shopKey => set({ hidden: new Set(v.shops.map(x => x.key).filter(k => k !== shopKey)) });
  return (
    <aside class="s-filters" aria-label="Filters">
      <div class="s-f-head"><h3>Shops</h3>{s.hidden.size > 0 && <button class="s-linkbtn" type="button" onClick={() => set({ hidden: new Set() })}>Show all</button>}</div>
      <div class="s-f-sec">
        {withMatches.map(x => (
          <div class="s-f-row" key={x.key}>
            <label><input type="checkbox" checked={!s.hidden.has(x.key)} onChange={e => toggleShop(x.key, e.currentTarget.checked)} /><span class="s-f-name">{x.name}</span></label>
            <button class="s-f-only" type="button" title={`Show only ${x.name}`} onClick={() => only(x.key)}>Only</button>
            <span class="s-f-count">{v.matchCount(x.key)}</span>
          </div>
        ))}
        {waiting.map(x => <div class="s-f-row wait" key={x.key}><span class="s-dot" /><span class="s-f-name">{x.name}</span><span class="s-f-count">…</span></div>)}
        {problems.map(x => (
          <div class="s-f-row problem" key={x.key}>
            <span class="s-f-name">{x.name}<br /><span class={`s-why${x.skipped ? "" : " fail"}`} title={x.error}>{x.skipped ? "Skipped" : "Didn't answer"}</span></span>
            <button class="s-linkbtn" type="button" onClick={() => askAgain(x.key)}>{x.skipped ? "Search now" : "Try again"}</button>
          </div>
        ))}
        {none.length > 0 && <details class="s-f-none"><summary>{plural(none.length, "shop")} had no match</summary><p>{none.map(x => x.name).join(", ")}</p></details>}
      </div>
      <div class="s-f-head"><h3>Only show</h3></div>
      <div class="s-f-sec">
        <div class="s-f-row"><label><input type="checkbox" checked={s.saleOnly} onChange={e => set({ saleOnly: e.currentTarget.checked })} /><span class="s-f-name">On sale</span></label><span class="s-f-count">{saleN}</span></div>
        <div class="s-f-row" title="Shops whose cart can be filled from this site"><label><input type="checkbox" checked={s.cartOnly} onChange={e => set({ cartOnly: e.currentTarget.checked })} /><span class="s-f-name">Can add to cart from here</span></label><span class="s-f-count">{cartN}</span></div>
      </div>
    </aside>
  );
}

const Skeleton = () => <div class="s-skel"><i class="box" /><span class="s-lines"><i style="width:60%" /><i style="width:35%" /></span><i /></div>;

function Results({ s, v }) {
  const filtered = s.hidden.size > 0 || s.saleOnly || s.cartOnly;
  const nFilters = s.hidden.size + s.saleOnly + s.cartOnly;
  const clearFilters = () => set({ hidden: new Set(), saleOnly: false, cartOnly: false });
  const shopsN = new Set(v.strong.map(p => p.shop)).size;
  const waiting = v.shops.filter(x => x.pending).length;
  const early = !s.shown;

  let body = null;
  if (s.error) body = <div class="s-empty"><p>{s.error}</p></div>;
  else if (!early && v.strong.length) {
    body = s.view === "group"
      ? <div class="s-cards">{sortedGroups(s.query, v.strong, s.sort).map(g => <ProductCard key={key(g.seed)} g={g} sort={s.sort} />)}</div>
      : <div class="s-flat">{sortedFlat(v.strong, s.sort).map(p => <Offer key={key(p)} p={p} mode="product" />)}</div>;
  } else if (!v.busy) {
    body = filtered && v.strongAll.length
      ? <div class="s-empty">
          <h2>Nothing matches these filters</h2>
          <p>{plural(v.strongAll.length, "match", "matches")} {v.strongAll.length === 1 ? "is" : "are"} hidden by the shops or options you picked.</p>
          <button class="btn" type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      : <div class="s-empty">
          <h2>No in-stock matches for “{s.query}”</h2>
          <p>Check the spelling, or try the part number alone: <b>LM7805</b> rather than <b>LM7805 regulator 5v</b>.{v.weak.length ? " There are weaker matches below." : ""}</p>
        </div>;
  }

  return (
    <div class="s-results" role="region" aria-label="Results">
      <div class="s-res-head">
        <div class="s-res-count">
          {early ? "Looking…" : <><b>{plural(v.strong.length, "match", "matches")}</b>{shopsN ? ` at ${plural(shopsN, "shop")}` : ""}</>}
          {filtered && <> · <button class="s-linkbtn" type="button" onClick={clearFilters}>clear filters</button></>}
        </div>
        <button class="btn small s-filters-btn" type="button" aria-expanded={s.showFilters} onClick={() => set({ showFilters: !s.showFilters })}>Filters{nFilters ? ` · ${nFilters}` : ""}</button>
        <div class="s-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={s.view === "group"} onClick={() => set({ view: "group" })}>By product</button>
          <button type="button" aria-pressed={s.view === "flat"} onClick={() => set({ view: "flat" })}>Every offer</button>
        </div>
        <select aria-label="Sort" value={s.sort} onChange={e => set({ sort: e.currentTarget.value })}>
          <option value="match">Best match</option>
          <option value="price">Cheapest</option>
          <option value="unit">Cheapest per piece</option>
        </select>
      </div>
      {body}
      {v.busy && (
        <div class="s-cards s-waiting">
          <div class="s-waiting-note">Waiting for {plural(waiting, "more shop")}…</div>
          {early ? <><Skeleton /><Skeleton /><Skeleton /></> : <Skeleton />}
        </div>
      )}
      {!early && v.weak.length > 0 && (
        <details class="s-weak">
          <summary><Chevron /> {plural(v.weak.length, "weaker match", "weaker matches")} <span class="s-muted">· probably a different part</span></summary>
          <div class="s-flat">{sortedFlat(v.weak, "price").map(p => <Offer key={key(p)} p={p} mode="product" reason={weakReason(s.query, p.name)} />)}</div>
        </details>
      )}
    </div>
  );
}

function Intro({ s }) {
  const chip = q => <button class="s-q-chip" type="button" key={q} onClick={() => runSearch(q)}>{q}</button>;
  return (
    <div class="s-intro">
      <div class="s-recent">
        {s.recent.length
          ? <><span class="s-lbl">Recent</span>{s.recent.map(chip)}<button class="s-linkbtn" type="button" onClick={() => setRecent([])}>Clear</button></>
          : <><span class="s-lbl">Try</span>{EXAMPLES.map(chip)}</>}
      </div>
      <ul class="s-facts">
        <li>{SHOPS.length} shops searched at once</li><li>In stock only</li><li>Per-piece price for packs</li><li>No account, nothing to install</li>
      </ul>
    </div>
  );
}

function SearchApp() {
  const s = store.use();
  useEffect(() => { $("#tab-search").classList.toggle("has-query", !!s.query); }, [s.query]);
  if (!s.query) return <Intro s={s} />;
  const v = view(s);
  return <>
    <Status s={s} v={v} />
    <div class={`s-layout${s.showFilters ? " show-filters" : ""}`}>
      <Filters s={s} v={v} />
      <Results s={s} v={v} />
    </div>
  </>;
}

/* ---------- the search box ---------- */

// the × shows while there is something to clear; the "/" hint while the box is idle and empty
function updateBox() {
  const q = $("#q");
  $("#q-clear").hidden = !q.value;
  $("#slash").hidden = !!q.value || document.activeElement === q || matchMedia("(hover: none)").matches;
}

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
const sharedQuery = (new URLSearchParams(location.search).get("q") || "").trim();
if (sharedQuery) {
  $("#q").value = sharedQuery;
  pendingQuery = sharedQuery;
}
updateBox();
render(<SearchApp />, $("#search-app"));

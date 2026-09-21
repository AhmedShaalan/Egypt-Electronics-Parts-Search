// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The results: by product or every offer, sorted, with the weaker matches folded away below.

import { useMemo } from "preact/hooks";
import { weakReason } from "../../matching.js";
import { key } from "../common.js";
import { plural } from "../format.js";
import { Chevron } from "../icons.jsx";
import { set } from "./state.js";
import { sortedGroups, sortedFlat } from "./view.js";
import { Offer, ProductCard } from "./offer.jsx";

const Skeleton = () => <div class="s-skel"><i class="box" /><span class="s-lines"><i style="width:60%" /><i style="width:35%" /></span><i /></div>;

export function Results({ s, v }) {
  const filtered = s.hidden.size > 0 || s.saleOnly || s.cartOnly;
  const nFilters = s.hidden.size + s.saleOnly + s.cartOnly;
  const clearFilters = () => set({ hidden: new Set(), saleOnly: false, cartOnly: false });
  const shopsN = new Set(v.strong.map(p => p.shop)).size;
  const waiting = v.shops.filter(x => x.pending).length;
  const early = !s.shown;
  // grouping compares every offer's name with the others, so it's done again only when the
  // offers or their order changed, not when a card opens or a star is tapped
  const shown = !early && v.strong.length > 0;
  const groups = useMemo(() => (shown && s.view === "group" ? sortedGroups(s.query, v.strong, s.sort) : null), [shown, s.view, s.query, v.strong, s.sort]);
  const flat = useMemo(() => (shown && s.view !== "group" ? sortedFlat(v.strong, s.sort) : null), [shown, s.view, v.strong, s.sort]);

  let body = null;
  if (s.error) body = <div class="s-empty"><p>{s.error}</p></div>;
  else if (shown) {
    body = groups
      ? <div class="s-cards">{groups.map(g => <ProductCard key={key(g.seed)} g={g} sort={s.sort} openKeys={s.openKeys} flashShop={s.flash} />)}</div>
      : <div class="s-flat">{flat.map(p => <Offer key={key(p)} p={p} mode="product" flash={p.shop === s.flash} />)}</div>;
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
          <button type="button" aria-pressed={s.view === "flat"} onClick={() => set({ view: "flat" })}>Every offer</button>
          <button type="button" aria-pressed={s.view === "group"} onClick={() => set({ view: "group" })}>By product</button>
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
          <summary><Chevron class="s-chev" /> {plural(v.weak.length, "weaker match", "weaker matches")} <span class="s-muted">· probably a different part</span></summary>
          <div class="s-flat">{sortedFlat(v.weak, "price").map(p => <Offer key={key(p)} p={p} mode="product" reason={weakReason(s.query, p.name)} flash={p.shop === s.flash} />)}</div>
        </details>
      )}
    </div>
  );
}

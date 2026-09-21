// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Starred items, with how their prices moved since they were starred, and what to do with the
// ones ticked.

import { $, money, safeUrl } from "../common.js";
import { num, ago } from "../format.js";
import { COPY_FORMATS, copy, copyText } from "../copy.js";
import { cartLink } from "../cart.js";
import { openAddToList, addToLastList, lastList } from "../add-to-list.js";
import { searchFor } from "../search/index.js";
import { Thumb, Menu } from "../components.jsx";
import { AddIcon, CartIcon, CloseIcon, CopyIcon, ExtIcon, ListsIcon, RefreshIcon, SearchIcon, TrashIcon } from "../icons.jsx";
import { set, kind, buyable, SORTS, select, removeItems, updateItemPrices } from "./state.js";

function ItemRow({ it, s }) {
  const k = kind(it);
  const diff = it.price - it.saved_price;
  const cart = k !== "cant" ? cartLink(it) : null;
  const url = safeUrl(it.url);
  const ticked = s.selected.has(it.id);
  const last = lastList();
  return (
    <div class={`v-item${ticked ? " selected" : ""}${k === "cant" ? " gone" : ""}${s.flash.has(it.id) ? " flash" : ""}`}>
      <label class="v-tick"><input type="checkbox" checked={ticked} onChange={e => select([it.id], e.currentTarget.checked)} aria-label={`Select ${it.name}`} /></label>
      <Thumb class="v-thumb" p={it} />
      <div class="v-text">
        <a class="v-name" href={url} target="_blank" rel="noopener">{it.name}</a>
        <div class="v-meta"><span class="v-shop">{it.shop_name}</span> · starred {ago(it.saved_at)}</div>
        {k === "cant"
          ? <div class="v-status">
              <span class="s-chip bad">{it.available ? "Out of stock" : "No longer listed"}</span>
              <button class="s-linkbtn" type="button" onClick={() => searchFor(it.name)}>Find elsewhere</button>
            </div>
          : k !== "same" && <div class="v-status"><span class={`v-delta ${k}`}>{k === "down" ? "▼" : "▲"} {num(Math.abs(diff))} EGP since saved</span></div>}
      </div>
      <div class="v-price">{k === "cant" ? <s>{money(it.price)}</s> : <b>{money(it.price)}</b>}</div>
      <div class="s-acts">
        {cart
          ? <a class="s-icon" href={cart} target="_blank" rel="noopener" title={`Add to cart at ${it.shop_name}`} aria-label={`Add to cart at ${it.shop_name}`}><CartIcon /></a>
          : <span class="s-icon-space" />}
        <Menu label={`More for ${it.name}`}>
          <a role="menuitem" href={url} target="_blank" rel="noopener"><ExtIcon /> Open at {it.shop_name}</a>
          <button type="button" role="menuitem" onClick={() => searchFor(it.name)}><SearchIcon /> Search every shop for it</button>
          {last && <button type="button" role="menuitem" onClick={() => addToLastList(it)}><AddIcon /> Add to “{last.name}”</button>}
          <button type="button" role="menuitem" onClick={() => openAddToList(it)}><ListsIcon /> {last ? "Add to another list…" : "Add to a parts list…"}</button>
          <button type="button" role="menuitem" onClick={() => copy(copyText([it], COPY_FORMATS[3]))}><CopyIcon /> Copy name, price and link</button>
          <hr />
          <button type="button" role="menuitem" class="danger" onClick={() => removeItems([it.id])}><TrashIcon /> Remove from saved</button>
        </Menu>
      </div>
    </div>
  );
}

export function Items({ s, items }) {
  if (!items.length) {
    return (
      <div class="v-empty">
        <h2>Nothing starred yet</h2>
        <p>Tap ☆ on a search result to keep an eye on its price. It shows up here with how it's changed since.</p>
        <button class="btn primary" type="button" onClick={() => { location.hash = "#search"; setTimeout(() => $("#q").focus(), 50); }}>Search for a part</button>
      </div>
    );
  }
  const count = k => items.filter(it => kind(it) === k).length;
  const shown = items.filter(it => s.filter === "all" || kind(it) === s.filter).sort(SORTS[s.sort]);
  const allTicked = shown.length > 0 && shown.every(it => s.selected.has(it.id));
  const lastCheck = items.map(it => it.checked_at).sort().pop();
  const chip = (id, label, n) => (
    <button class="s-fchip" type="button" aria-pressed={s.filter === id} disabled={!n && id !== "all"} onClick={() => set({ filter: id })}>
      {label}<span class="s-fchip-n">{n}</span>
    </button>
  );
  return <>
    <div class="v-toolbar">
      {chip("all", "All", items.length)}{chip("down", "Cheaper now", count("down"))}{chip("up", "Pricier", count("up"))}{chip("cant", "Can't buy", count("cant"))}
      <select aria-label="Sort" value={s.sort} onChange={e => set({ sort: e.currentTarget.value })}>
        <option value="new">Newest first</option>
        <option value="drop">Biggest drop first</option>
        <option value="shop">By shop</option>
        <option value="price">Cheapest first</option>
      </select>
    </div>
    <div class="v-list">
      <div class="v-list-top">
        <label><input type="checkbox" checked={allTicked} disabled={!shown.length} onChange={e => select(shown.map(it => it.id), e.currentTarget.checked)} /> Select all</label>
        <span class="v-checked">{s.checking
          ? <><span class="s-bar-anim" />Updating {Math.min(s.checking.done + 1, s.checking.total)} of {s.checking.total}…</>
          : <>{lastCheck && `Prices updated ${ago(lastCheck)}`}<button class="btn small v-btn" type="button" onClick={updateItemPrices}><RefreshIcon /> Update prices</button></>}</span>
      </div>
      {shown.length
        ? shown.map(it => <ItemRow key={it.id} it={it} s={s} />)
        : <div class="v-empty inner"><p>Nothing here right now.</p><button class="s-linkbtn" type="button" onClick={() => set({ filter: "all" })}>Show all</button></div>}
    </div>
  </>;
}

// what's ticked, and what to do with it
export function BulkBar({ s, items }) {
  const sel = items.filter(it => s.selected.has(it.id));
  if (s.tab !== "items" || !sel.length) return null;
  const cost = sel.filter(buyable).reduce((sum, it) => sum + it.price, 0);
  const cant = sel.filter(it => !buyable(it)).length;
  const clear = () => set({ selected: new Set() });
  return (
    <div class="v-bulk" role="region" aria-label="Selected items">
      <span class="v-what"><b>{sel.length}</b> selected · <b>{money(cost)}</b>{cant ? <span class="s-muted"> ({cant} can't be bought)</span> : null}</span>
      <button class="btn primary small v-btn" type="button" onClick={() => openAddToList(sel, { onAdded: clear })}><AddIcon /> Add to a parts list</button>
      <button class="btn small" type="button" onClick={() => copy(copyText(sel, COPY_FORMATS[2]))}>Copy</button>
      <button class="btn small" type="button" onClick={() => removeItems(sel.map(it => it.id))}>Remove</button>
      <button class="s-icon" type="button" title="Clear selection" aria-label="Clear selection" onClick={clear}><CloseIcon /></button>
    </div>
  );
}

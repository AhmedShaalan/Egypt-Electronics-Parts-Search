// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A result: one shop's offer, or a card with the same product at several shops.

import { money, safeUrl, key, buyRule } from "../common.js";
import { plural, num } from "../format.js";
import { COPY_FORMATS, copy, copyText } from "../copy.js";
import { cartLink } from "../cart.js";
import { isSaved, toggleSave } from "../saved.js";
import { openAddToList, addToLastList, lastList } from "../add-to-list.js";
import { Thumb, Menu } from "../components.jsx";
import { AddIcon, CartIcon, Chevron, CopyIcon, ExtIcon, ListsIcon, StarIcon } from "../icons.jsx";
import { store, set } from "./state.js";
import { priceKey } from "./view.js";

function Price({ p }) {
  return (
    <div class="s-price">
      <span class="s-price-main">{p.old_price ? <s>{num(p.old_price)}</s> : null}<b>{money(p.price)}</b></span>
      {p.pack > 1 && <small>pack of {p.pack} · {money(p.unit_price)} each</small>}
      {buyRule(p) && <small class="s-rule">{buyRule(p)}</small>}
    </div>
  );
}

function AddItems({ p }) {
  const last = lastList();
  return <>
    {last && <button type="button" role="menuitem" onClick={() => addToLastList(p)}><AddIcon /> Add to “{last.name}”</button>}
    <button type="button" role="menuitem" onClick={() => openAddToList(p, { onAdded: () => set({ tick: store.state.tick + 1 }) })}><ListsIcon /> {last ? "Add to another list…" : "Add to a parts list…"}</button>
  </>;
}

// `mode` "shop" leads with the shop, for the offers in a product card; `flash` lights it up
export function Offer({ p, mode, cheapest, reason, flash }) {
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
    <div class={`s-offer${flash ? " flash" : ""}`}>
      <Thumb class="s-thumb" p={p} />
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

// `openKeys` are the offers in open cards, `flashShop` a shop whose results just came in
export function ProductCard({ g, sort, openKeys, flashShop }) {
  const best = g.offers[0];
  const n = g.offers.length;
  if (n === 1) return <article class="s-card single"><Offer p={best} mode="product" flash={best.shop === flashShop} /></article>;
  // a card that was open stays open as more shops join it
  const open = g.offers.some(o => openKeys.has(key(o)));
  const shopCount = new Set(g.offers.map(o => o.shop)).size;
  const next = g.offers.slice(1, 4).map(o => `${o.shop_name} ${num(priceKey(o, sort))}`).join(" · ");
  const flash = g.offers.some(o => o.shop === flashShop);
  return (
    <article class={`s-card group${open ? " open" : ""}${flash ? " flash" : ""}`}>
      <div class="s-g-head">
        <button class="s-g-toggle" type="button" aria-expanded={open} onClick={() => toggleGroup(g, !open)}>
          <Thumb key={key(g.seed.image ? g.seed : best)} class="s-thumb" p={g.seed.image ? g.seed : best} big />
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
          <Chevron class="s-chev" />
        </button>
        <div class="s-acts">
          <Menu label={`More for ${g.seed.name}`}>
            <AddItems p={g.seed} />
            <hr />
            <button type="button" role="menuitem" onClick={() => copyGroup(g)}><CopyIcon /> Copy all {n} offers</button>
          </Menu>
        </div>
      </div>
      {open && <div class="s-g-offers">{g.offers.map((o, i) => <Offer key={key(o)} p={o} mode="shop" cheapest={i === 0} flash={o.shop === flashShop} />)}</div>}
    </article>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Shops tab: every shop searched, which of them take a cart from here, and finding one by name.

import { useState } from "preact/hooks";
import { SHOPS } from "../../shops.js";
import { NO_AUTOFILL } from "../common.js";
import { cartShop } from "../cart.js";
import { CartIcon, SearchIcon } from "../icons.jsx";

const SUGGEST_URL = "https://github.com/AhmedShaalan/Egypt-Electronics-Parts-Search/issues/new?title=" + encodeURIComponent("Add a shop: ");
const BY_NAME = [...SHOPS].sort((a, b) => a.name.localeCompare(b.name));
const CARTS = SHOPS.filter(s => cartShop(s.key)).length;

// each shop's letter gets its own colour, the same on every visit
const hue = key => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function Shop({ shop }) {
  const cart = cartShop(shop.key);
  return (
    <article class={`sh-shop${cart ? " cart" : ""}`}>
      <span class="sh-mark" style={{ "--h": hue(shop.key) }} aria-hidden="true">{shop.name[0]}</span>
      <a class="sh-name" href={shop.base} target="_blank" rel="noopener" title={new URL(shop.base).hostname.replace(/^www\./, "")}>{shop.name}</a>
      {cart ? <span class="sh-badge" title="Add to this shop's cart from a search or a parts list"><CartIcon />Add to cart</span> : null}
    </article>
  );
}

export function ShopsApp() {
  const [find, setFind] = useState("");
  const [cartOnly, setCartOnly] = useState(false);
  const q = find.trim().toLowerCase();
  const shown = BY_NAME.filter(s => (!cartOnly || cartShop(s.key)) && (!q || s.name.toLowerCase().includes(q)));
  const chip = (on, label, n) => (
    <button class="s-fchip" type="button" aria-pressed={cartOnly === on} onClick={() => setCartOnly(on)}>{label}<span class="s-fchip-n">{n}</span></button>
  );
  return (
    <>
      <div class="sh-head">
        <h1>Shops</h1>
        <p class="sh-sub">Every search checks these {SHOPS.length} Egyptian shops at the same time. They all sell online and deliver across Egypt, and {CARTS} of them let you add to their cart straight from a search or parts list.</p>
      </div>
      <div class="sh-toolbar">
        <label class="sh-find"><SearchIcon />
          <input type="search" placeholder="Find a shop" aria-label="Find a shop" value={find} onInput={e => setFind(e.currentTarget.value)} {...NO_AUTOFILL} />
        </label>
        {chip(false, "All", SHOPS.length)}
        {chip(true, "Add to cart", CARTS)}
      </div>
      <div class="sh-grid">
        {shown.length
          ? shown.map(s => <Shop key={s.key} shop={s} />)
          : <div class="sh-none"><p>No shop matches “{find.trim()}”.</p>
              <button class="btn" type="button" onClick={() => { setFind(""); setCartOnly(false); }}>Show all shops</button></div>}
      </div>
      <div class="sh-suggest">
        <div>
          <h2>Know a shop that should be here?</h2>
          <p>It needs an online store that shows prices and stock. Tell me its name and website and I'll add it.</p>
        </div>
        <a class="btn" href={SUGGEST_URL} target="_blank" rel="noopener">Suggest a shop</a>
      </div>
      <p class="sh-how">Not affiliated with any shop. Prices and stock come straight from their sites.</p>
    </>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Shops tab: every shop searched, with its address and the platform it runs on.

import { render } from "preact";
import { SHOPS } from "../shops.js";

function ShopRow({ shop }) {
  const domain = new URL(shop.base).hostname.replace(/^www\./, "");
  return (
    <div class="row shop-row">
      <div class="shop-mark" aria-hidden="true">{shop.name[0]}</div>
      <div>
        <a class="name" href={shop.base} target="_blank" rel="noopener">{shop.name}</a>
        <div class="meta">{domain}</div>
      </div>
      <span class="chip">{shop.platform}</span>
    </div>
  );
}

export function renderShops(el) {
  render(SHOPS.map(s => <ShopRow key={s.key} shop={s} />), el);
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Above the results of a search for a pasted link: the product the link is to, and the same
// product at the other shops, as grouping.js tells it from the results, cheapest first.

import { useMemo, useState } from "preact/hooks";
import { groupOffers } from "../../grouping.js";
import { shopOf, linkIn } from "../../links.js";
import { key, money } from "../common.js";
import { plural } from "../format.js";
import { Offer } from "./offer.jsx";

// while its shop is asked which product a link is to
export function Linking({ s }) {
  const shop = shopOf(linkIn(s.linking).url);
  return (
    <div class="s-status">
      <span class="s-bar-anim" />
      <span>Looking up the product at {shop?.name ?? "the shop"}…</span>
    </div>
  );
}

const FIRST = 4; // the cheapest of the other shops shown before "Show more"

export function Linked({ s, v }) {
  const p = s.linked;
  const [all, setAll] = useState(false);
  const same = useMemo(() => {
    if (!p) return [];
    const others = v.strongAll.filter(o => key(o) !== key(p));
    const g = groupOffers(s.query, [p, ...others]).find(x => x.offers.includes(p));
    return g.offers.filter(o => o !== p).sort((a, b) => a.price - b.price);
  }, [p, v.strongAll, s.query]);
  if (!p) return null;
  const best = same[0];
  const shops = new Set([p.shop, ...same.map(o => o.shop)]).size;
  let says;
  if (best && best.price < p.price) says = <><b>{money(p.price - best.price)} cheaper</b> at {best.shop_name}</>;
  else if (best) says = <>The cheapest of {plural(shops, "shop")} that have it</>;
  else if (v.busy) says = "Looking for it at the other shops…";
  else says = "No other shop has this one in stock. Similar parts are below";
  return (
    <section class="s-linked" aria-label="From your link">
      <div class="s-linked-head">
        <span class="s-lbl">From your link</span>
        <span class="s-linked-says">{says}</span>
      </div>
      {/* one out of stock can't go in the cart */}
      <div class="s-flat"><Offer p={p.in_stock ? p : { ...p, cart: false, options: null }} mode="product" reason={p.in_stock ? null : "Out of stock"} /></div>
      {same.length > 0 && <>
        <div class="s-linked-sub">The same product at {plural(new Set(same.map(o => o.shop).filter(k => k !== p.shop)).size, "other shop")}</div>
        <div class="s-flat">{(all ? same : same.slice(0, FIRST)).map((o, i) => <Offer key={key(o)} p={o} mode="shop" cheapest={i === 0 && o.price < p.price} flash={o.shop === s.flash} />)}</div>
        {same.length > FIRST && (
          <button class="s-linkbtn s-linked-more" type="button" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show ${same.length - FIRST} more`}
          </button>
        )}
      </>}
    </section>
  );
}

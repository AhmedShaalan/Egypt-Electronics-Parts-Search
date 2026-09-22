// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// What the results show: the search with the filters applied, grouped or sorted.

import { SHOPS } from "../../shops.js";
import { STRONG } from "../../matching.js";
import { groupOffers } from "../../grouping.js";
import { cartLink, cartChoices } from "../cart.js";

export const priceKey = (p, sort) => sort === "unit" ? p.unit_price : p.price;
export const canCart = p => !!cartLink(p) || cartChoices(p);

// the shops and the offers to show; it depends on the result and the filters only
export function viewOf(s) {
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

// the same product at different shops as one group, the best match or cheapest first
export function sortedGroups(query, offers, sort) {
  const byPrice = [...offers].sort((a, b) => priceKey(a, sort) - priceKey(b, sort));
  const groups = groupOffers(query, byPrice);
  const best = g => Math.max(...g.offers.map(o => o.score));
  if (sort === "match") groups.sort((a, b) => best(b) - best(a) || priceKey(a.offers[0], sort) - priceKey(b.offers[0], sort));
  return groups;
}

export function sortedFlat(offers, sort) {
  return [...offers].sort(sort === "match"
    ? (a, b) => b.score - a.score || a.price - b.price
    : (a, b) => priceKey(a, sort) - priceKey(b, sort));
}

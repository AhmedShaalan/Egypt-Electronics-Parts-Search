// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Ways to buy a priced parts list: which product to take for each part, and from which shops.
//
// Every set of shops is tried. Each part takes its cheapest close match among the set's shops,
// and a set that leaves a part out doesn't count. Of the sets that cover every part:
// - best: the lowest parts cost plus delivery, one fee per shop used
// - cheap: the lowest parts cost
// - fewest: the fewest shops, then the lowest parts cost
// and custom: the plan the person started from, with the products they chose themselves.
//
// For speed, each part's options are its cheapest offer per shop, cheapest first, so a set is
// checked in a few steps per part; 16 shops make 65,536 sets, done in well under a second.

import { isClose, lineCost } from "./search.js";

// the close matches the plans may pick; a line with only weaker matches ("Check match") has
// none, so it's only bought when the person picks one of them
export const goodFor = (line, c) => !line.weak && isClose(line, c);

// rows: [{ id, line, pin }], where `line` is a priced line (search.js listLine) and `pin` the index of
// the candidate chosen by hand, or null. fees: { default, byShop }. Returns { best, cheap, fewest,
// custom } (custom null without picks); each is { assign: Map(row id -> candidate), parts, delivery,
// total, used: Set(shop keys) }, or null when no part can be bought.
export function planOrder(rows, fees, customBase = "best") {
  const feeOf = shop => fees.byShop?.[shop] ?? fees.default ?? 0;
  const pinned = r => (r.pin != null ? r.line.candidates[r.pin] : null);
  // a pick on a part that has close matches is the person's own choice, kept for Custom; a pick
  // on a part with only weaker matches is the only way to buy it, so every plan uses it
  const freeable = r => pinned(r) && r.line.candidates.some(c => goodFor(r.line, c));

  const parts = [];
  for (const r of rows) {
    const forced = !freeable(r) && pinned(r);
    if (forced) { parts.push({ r, options: [{ shop: forced.shop, c: forced, cost: lineCost(r.line, forced) }] }); continue; }
    const byShop = new Map();
    for (const c of r.line.candidates) {
      if (!goodFor(r.line, c)) continue;
      const cost = lineCost(r.line, c);
      if (!byShop.has(c.shop) || cost < byShop.get(c.shop).cost) byShop.set(c.shop, { shop: c.shop, c, cost });
    }
    if (byShop.size) parts.push({ r, options: [...byShop.values()].sort((a, b) => a.cost - b.cost) });
  }
  if (!parts.length) return { best: null, cheap: null, fewest: null, custom: null };

  const shops = [...new Set(parts.flatMap(p => p.options.map(o => o.shop)))];
  const bit = new Map(shops.map((s, i) => [s, 1 << i]));
  const optionBits = parts.map(p => p.options.map(o => bit.get(o.shop)));
  const found = new Map(); // the shops actually used -> the cheapest way to use them
  for (let mask = 1; mask < 1 << shops.length; mask++) {
    let cost = 0;
    let used = 0;
    const pick = [];
    let covered = true;
    for (let i = 0; i < parts.length; i++) {
      const j = optionBits[i].findIndex(b => mask & b);
      if (j < 0) { covered = false; break; }
      const o = parts[i].options[j];
      cost += o.cost;
      used |= optionBits[i][j];
      pick.push(o.c);
    }
    if (!covered) continue;
    if (!found.has(used) || found.get(used).parts > cost) found.set(used, { parts: cost, pick, used });
  }
  const plan = ({ parts: cost, pick, used }) => {
    const usedShops = new Set(shops.filter(s => used & bit.get(s)));
    const delivery = [...usedShops].reduce((sum, s) => sum + feeOf(s), 0);
    return { assign: new Map(parts.map((p, i) => [p.r.id, pick[i]])), parts: cost, delivery, total: cost + delivery, used: usedShops };
  };
  const all = [...found.values()].map(plan);
  const min = key => all.reduce((a, b) => (key(b) < key(a) ? b : a));
  const plans = {
    best: min(p => p.total * 1000 + p.used.size),
    cheap: min(p => p.parts * 1000 + p.used.size),
    fewest: min(p => p.used.size * 1e9 + p.parts),
    custom: null,
  };

  // Custom: the plan it started from, with the rows picked by hand swapped in. Nothing else moves.
  const picked = rows.filter(freeable);
  if (picked.length) {
    const base = plans[customBase] || plans.best;
    const assign = new Map(base.assign);
    for (const r of picked) assign.set(r.id, pinned(r));
    const byId = new Map(rows.map(r => [r.id, r]));
    let cost = 0;
    for (const [id, c] of assign) cost += lineCost(byId.get(id).line, c);
    const used = new Set([...assign.values()].map(c => c.shop));
    const delivery = [...used].reduce((sum, s) => sum + feeOf(s), 0);
    plans.custom = { assign, parts: cost, delivery, total: cost + delivery, used, picks: picked.length };
  }
  return plans;
}

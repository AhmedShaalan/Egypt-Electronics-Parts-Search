// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A row's offers, floating over the rows below it: every product found for the part, the close
// matches first, and a choice of one of them.

import { useEffect, useRef } from "preact/hooks";
import { lineCost } from "../../search.js";
import { weakReason } from "../../matching.js";
import { goodFor } from "../../plans.js";
import { cheapestGood, weakCheaper, isPick } from "../../list-model.js";
import { money, safeUrl, priceDetail, NO_AUTOFILL } from "../common.js";
import { Thumb } from "../components.jsx";
import { ExtIcon } from "../icons.jsx";
import { store, set } from "./state.js";
import { choose } from "./actions.js";

// why the plan took `c` when a cheaper product was there
function Why({ r, c }) {
  if (!c || isPick(r, c)) return null;
  const low = cheapestGood(r.line);
  if (low && lineCost(r.line, low) < lineCost(r.line, c)) {
    return <p class="l-why">{low.shop_name} is {money(lineCost(r.line, c) - lineCost(r.line, low))} cheaper for this part, but buying it at {c.shop_name} <b>saves a delivery</b>.</p>;
  }
  const weak = weakCheaper(r.line, c);
  if (weak) return <p class="l-why">A cheaper “{weak.name}” at {weak.shop_name} was skipped. {weakReason(r.query, weak.name)}.</p>;
  return null;
}

// choosing an offer closes the list, so the arrow keys only move between the offers, which
// the browser would otherwise choose as it went; Space or Enter chooses
function moveAmong(e) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.click(); return; }
  if (!step) return;
  e.preventDefault();
  const all = [...e.currentTarget.closest("tbody").querySelectorAll("input[type=radio]")];
  all[Math.min(all.length - 1, Math.max(0, all.indexOf(e.currentTarget) + step))].focus();
}

export function Offers({ r, c, filter }) {
  const line = r.line;
  const box = useRef(null);
  useEffect(() => {
    if (matchMedia("(hover: hover)").matches) box.current.querySelector("input").focus({ preventScroll: true });
    box.current.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const onClick = e => { if (!e.target.closest(".l-options, .l-product")) set({ open: null }); };
    const onKey = e => {
      if (e.key !== "Escape") return;
      set({ open: null });
      document.querySelector(`[data-row="${r.id}"] .l-product`)?.focus();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, []);
  const f = filter.trim().toLowerCase();
  const list = line.candidates.map((x, i) => ({ x, i })).filter(({ x }) => !f || `${x.name} ${x.shop_name}`.toLowerCase().includes(f));
  const byCost = (a, b) => lineCost(line, a.x) - lineCost(line, b.x);
  const good = list.filter(({ x }) => goodFor(line, x)).sort(byCost);
  const weak = list.filter(({ x }) => !goodFor(line, x)).sort(byCost);
  const low = good[0] ? lineCost(line, good[0].x) : 0;
  const tr = ({ x, i }) => (
    <tr key={i} class={x === c ? "chosen" : ""} onClick={e => !e.target.closest("a, input") && choose(r.id, i)}>
      <td><input type="radio" class="l-radio" name={`pick-${r.id}`} checked={x === c}
        aria-label={`${x.name} at ${x.shop_name}, ${money(lineCost(line, x))}`} onClick={() => choose(r.id, i)} onKeyDown={moveAmong} /></td>
      <td>
        <span class="l-pname"><Thumb class="l-thumb" p={x} big />
          <span class="l-pname-text">{x.name}<small class="num">{priceDetail(line, x)}</small>
            <small class="l-shop-inline">{x.shop_name}{x.cart ? "" : " · order on their site"}</small>
            {goodFor(line, x) ? null : <small class="l-note">{weakReason(r.query, x.name)}</small>}</span>
        </span>
      </td>
      <td class="l-shop-cell">{x.shop_name}{x.cart ? null : <small>order on their site</small>}</td>
      <td class="r num"><b>{money(lineCost(line, x))}</b>
        {goodFor(line, x) ? (lineCost(line, x) > low ? <small class="l-delta">+{money(lineCost(line, x) - low)}</small> : <span class="l-chip soft">Cheapest</span>) : null}
      </td>
      <td><a class="s-icon" href={safeUrl(x.url)} target="_blank" rel="noopener" title={`Open at ${x.shop_name}`} aria-label={`Open ${x.name} at ${x.shop_name}`}><ExtIcon /></a></td>
    </tr>
  );
  return (
    <div class="l-options" ref={box}>
      <input type="search" class="l-filter" placeholder="Filter by name or shop" value={filter} aria-label="Filter offers" {...NO_AUTOFILL}
        onInput={e => set({ filters: { ...store.state.filters, [r.id]: e.currentTarget.value } })} />
      <div class="l-table-wrap">
        <table class="l-opts">
          <thead><tr><th><span class="sr-only">Chosen</span></th><th>Product</th><th class="l-shop-cell">Shop</th><th class="r">Your cost</th><th><span class="sr-only">Open</span></th></tr></thead>
          <tbody>
            {good.map(tr)}
            {weak.length ? <tr class="group"><td colspan="5">Weaker matches, probably a different part. Never picked for you.</td></tr> : null}
            {weak.map(tr)}
            {list.length ? null : <tr class="group"><td colspan="5">Nothing matches “{filter}”.</td></tr>}
          </tbody>
        </table>
      </div>
      <Why r={r} c={c} />
    </div>
  );
}

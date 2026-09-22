// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The order, beside the rows: how to buy (plans.js), delivery fees, and one basket per shop with
// its cart.

import { useEffect, useRef, useState } from "preact/hooks";
import { SHOPS, SHOPS_BY_KEY } from "../../shops.js";
import { lineCost, packsNeeded } from "../../search.js";
import { priced } from "../../list-model.js";
import { deliveryFee } from "../../plans.js";
import { money, safeUrl } from "../common.js";
import { plural } from "../format.js";
import { copy } from "../copy.js";
import { cartShop } from "../cart.js";
import { NumField, Money } from "../components.jsx";
import { CartIcon, CheckIcon, CloseIcon, CopyIcon } from "../icons.jsx";
import { change, setFees, PLAN_NAMES } from "./state.js";
import { fill, orderMessage, wholeOrderMessage } from "./actions.js";
import { progress } from "./pricing.js";

const STRATEGIES = [
  ["best", "parts + delivery, lowest"],
  ["cheap", "more shops can mean more delivery"],
  ["fewest", "fewest deliveries to wait for"],
];

function Strategies({ s, plans, strategy }) {
  const c = plans.custom;
  return (
    <div class="l-strats" role="radiogroup" aria-label="How to buy">
      {STRATEGIES.map(([k, sub]) => {
        const p = plans[k];
        return (
          <button class="l-strat" type="button" role="radio" key={k} aria-checked={strategy === k} disabled={!p} onClick={() => change({ strategy: k })}>
            <span class="t">{PLAN_NAMES[k]}{k === "best" ? <span class="l-rec">Suggested</span> : null}</span>
            <span class="v num">{p ? <Money value={p.total} /> : "—"}</span>
            <span class="s">{p ? `${plural(p.used.size, "shop")} · ${sub}` : sub}</span>
          </button>
        );
      })}
      {c
        ? <button class="l-strat" type="button" role="radio" aria-checked={strategy === "custom"} onClick={() => change({ strategy: "custom" })}>
            <span class="t">{PLAN_NAMES.custom}</span><span class="v num"><Money value={c.total} /></span>
            <span class="s">{plural(c.used.size, "shop")} · {plural(c.picks, "pick")} of yours on top of {PLAN_NAMES[s.customBase]}</span>
          </button>
        : <div class="l-strat off"><span class="t">{PLAN_NAMES.custom}</span><span class="v" />
            <span class="s">Choose another product in any row to make your own</span></div>}
    </div>
  );
}

// the fee for each shop the person set, then the one for any other shop; every picker lists its
// own shop and the shops without a fee yet, the ones in the order first
function Fees({ fees, used }) {
  const own = Object.keys(fees.byShop);
  const free = SHOPS.map(x => x.key).filter(k => !(k in fees.byShop))
    .sort((a, b) => used.has(b) - used.has(a) || SHOPS_BY_KEY[a].name.localeCompare(SHOPS_BY_KEY[b].name));
  const label = k => `${SHOPS_BY_KEY[k]?.name ?? k}${used.has(k) ? " · in your order" : ""}`;
  const byShop = entries => ({ ...fees, byShop: Object.fromEntries(entries) });
  return (
    <ul class="l-fee-list">
      {own.map((k, i) => (
        <li key={i}>
          <select aria-label="Shop" value={k}
            onChange={e => setFees(byShop(Object.entries(fees.byShop).map(([x, v]) => [x === k ? e.currentTarget.value : x, v])))}>
            {[k, ...free].map(x => <option value={x} key={x}>{label(x)}</option>)}
          </select>
          <NumField min={0} max={9999} step="5" value={fees.byShop[k]} aria-label={`Delivery from ${SHOPS_BY_KEY[k]?.name ?? k}`}
            onValue={v => setFees(byShop(Object.entries(fees.byShop).map(([x, old]) => [x, x === k ? v : old])))} />
          <span class="l-unit">EGP</span>
          <button class="s-icon" type="button" title="Use the usual fee" aria-label={`Remove ${SHOPS_BY_KEY[k]?.name ?? k}'s fee`}
            onClick={() => setFees(byShop(Object.entries(fees.byShop).filter(([x]) => x !== k)))}><CloseIcon /></button>
        </li>
      ))}
      <li>
        <select aria-label="Shop" disabled><option>Any other shop</option></select>
        <NumField id="l-fee" min={0} max={9999} step="5" value={fees.default} aria-label="Delivery from any other shop"
          onValue={v => setFees({ ...fees, default: v })} />
        <span class="l-unit">EGP</span><span />
      </li>
      {free.length
        ? <li class="l-fee-add"><button class="s-linkbtn" type="button" onClick={() => setFees(byShop([...Object.entries(fees.byShop), [free[0], fees.default]]))}>+ Add a shop's fee</button></li>
        : null}
    </ul>
  );
}

// a shop's parts and its delivery fee; the shops' totals add up to the plan's
function Basket({ shop, entries, fee, filling }) {
  const sh = SHOPS_BY_KEY[shop];
  const sub = entries.reduce((sum, e) => sum + lineCost(e.line, e.product), 0) + fee;
  const cartable = cartShop(shop) && entries.some(e => e.product.cart);
  const left = cartable ? entries.filter(e => !e.product.cart).length : 0;
  const busy = filling?.shop === shop;
  return (
    <div class="l-basket">
      <div class="l-basket-head"><b>{sh.name}</b><span class="num l-sub"><Money value={sub} /></span></div>
      <ul>
        {entries.map(e => (
          <li key={e.row.id}>
            <span><code>{packsNeeded(e.line, e.product)}×</code> <a class="l-item-link" href={safeUrl(e.product.url)} target="_blank" rel="noopener" title={`Open at ${sh.name}`}>{e.product.name}</a></span>
            <span class="num">{money(lineCost(e.line, e.product))}</span>
          </li>
        ))}
        <li class="l-deliv"><span>Delivery</span><span class="num">~{money(fee)}</span></li>
      </ul>
      {cartable
        ? <div class="l-cart-actions">
            <button class="btn" type="button" disabled={!!filling} onClick={() => fill(shop, entries)} title="Opens the shop with these in its cart, quantities set. You check out there.">
              <CartIcon />{busy ? (filling.total > 1 ? `Adding ${Math.min(filling.done + 1, filling.total)} of ${filling.total}…` : "Opening…") : `Fill cart at ${sh.name}`}
            </button>
            <button class="btn l-icon-only" type="button" title="Copy the order as a message" aria-label={`Copy the ${sh.name} order as a message`} onClick={() => copy(orderMessage(sh.name, entries, fee))}><CopyIcon /></button>
          </div>
        : <button class="btn" type="button" title="Copy the order as a message, for their WhatsApp or order form" onClick={() => copy(orderMessage(sh.name, entries, fee))}><CopyIcon />Copy as message</button>}
      {cartable
        ? (left ? <p class="l-how">{left === 1 ? "One part has" : `${left} parts have`} a colour or option to choose. Choose it in {left === 1 ? "its row" : "their rows"} to add {left === 1 ? "it" : "them"} here, or add {left === 1 ? "it" : "them"} on their site.</p> : null)
        : <p class="l-how">Its cart can't be filled from here. Open each part and add it on their site.</p>}
    </div>
  );
}

// The total, and under it `children`, what it's made of. While parts are still being priced, or a
// shop is still to answer, it's marked as a total so far, with how far pricing has got below, so
// a number still climbing isn't taken for the final one. It lights up once when it is.
function Total({ plan, children }) {
  const { n, settled, late, final } = progress();
  const [lit, setLit] = useState(false);
  const was = useRef(final);
  useEffect(() => {
    const now = was.current !== final && final && !!plan;
    was.current = final;
    if (!now) return;
    setLit(true);
    const t = setTimeout(() => setLit(false), 1400);
    return () => { clearTimeout(t); setLit(false); };
  }, [final]);
  const label = settled < n ? `Pricing ${settled} of ${n} parts…`
    : late.length ? `Almost done · waiting for ${late.map(x => x.name || SHOPS_BY_KEY[x.key]?.name).sort().join(", ")}` : null;
  const share = settled < n ? settled / n : 0.95;
  return <>
    <div class={`l-total num${final ? "" : " so-far"}${lit ? " lit" : ""}`}>{plan ? <Money value={plan.total} /> : "—"}</div>
    {children}
    {!final && n ? <>
      <div class="l-progress" aria-hidden="true"><i style={{ width: `${Math.round(share * 100)}%` }} /></div>
      <div class="l-total-state"><span class="l-spin" aria-hidden="true" />{label}</div>
    </> : null}
  </>;
}

// What the plan buys at each shop, the shops whose cart can be filled first: [shop key, entries].
// The order panel shows them, and both ways of copying the order go through them.
export function basketsOf(rows, plan) {
  const byShop = new Map();
  for (const r of rows.filter(priced)) {
    const c = plan?.assign.get(r.id);
    if (c) byShop.set(c.shop, [...(byShop.get(c.shop) || []), { row: r, line: r.line, product: c }]);
  }
  const canFill = ([k, es]) => cartShop(k) && es.some(e => e.product.cart);
  return [...byShop].sort((a, b) => canFill(b) - canFill(a) || b[1].length - a[1].length);
}

// every shop's order as one message, with the delivery fees set here
export const orderText = (baskets, fees) => wholeOrderMessage(baskets.map(([k, es]) => [SHOPS_BY_KEY[k].name, es, deliveryFee(fees, k)]));

export function Order({ s, plans, strategy, plan }) {
  const empty = !s.rows.length;
  const okRows = s.rows.filter(priced);
  const missing = okRows.filter(r => !plan?.assign.has(r.id)).length;
  const baskets = basketsOf(s.rows, plan);
  const notes = [missing && `${plural(missing, "part")} not counted`].filter(Boolean);
  return (
    <aside class="l-order" id="order" aria-label="Order">
      <div class={`l-panel${empty ? " has-overlay" : ""}`}>
        {empty ? <div class="l-overlay">No parts yet. Type or paste them in the box.</div> : null}
        <h2>How to buy</h2>
        <Strategies s={s} plans={plans} strategy={strategy} />
        <Total plan={plan}>
          <div class="l-total-sub num">
            {plan ? `${money(plan.parts)} parts + ~${money(plan.delivery)} delivery from ${plural(plan.used.size, "shop")}` : "Nothing to buy yet"}
            {notes.length ? ` · ${notes.join(" · ")}` : ""}
          </div>
        </Total>
      </div>
      <div class={`l-panel l-fees${empty ? " has-overlay" : ""}`}>
        {empty ? <div class="l-overlay">Add parts first, then set delivery fees here.</div> : null}
        <h2>Delivery fees{s.feeState ? <span class="l-fee-state">{s.feeState === "saved" ? <><CheckIcon />Saved</> : "Saving…"}</span> : null}</h2>
        <Fees fees={s.fees} used={plan?.used || new Set()} />
      </div>
      <div class="l-panel">
        <div class="l-panel-head">
          <h2>Your order{baskets.length ? ` · ${plural(baskets.length, "shop")}` : ""}</h2>
          {baskets.length
            ? <button class="btn small" type="button" title="Copy every shop's order as one message"
                onClick={() => copy(orderText(baskets, s.fees))}><CopyIcon />Copy all</button>
            : null}
        </div>
        {baskets.length
          ? baskets.map(([k, es]) => <Basket key={k} shop={k} entries={es} fee={deliveryFee(s.fees, k)} filling={s.filling} />)
          : <p class="l-muted">{empty ? "Add parts to see the order." : "Nothing to order yet."}</p>}
      </div>
    </aside>
  );
}

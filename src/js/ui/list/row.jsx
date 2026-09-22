// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A part on the list: its quantity, what the plan buys for it and at what cost, and its offers.

import { useState } from "preact/hooks";
import { SHOPS, SHOPS_BY_KEY } from "../../shops.js";
import { SHOP_TIMEOUT_MS } from "../../config.js";
import { lineCost } from "../../search.js";
import { MAX_QTY, isPick, pendingShops, held } from "../../list-model.js";
import { money, safeUrl, priceDetail } from "../common.js";
import { plural } from "../format.js";
import { Thumb, Menu, NumField, memo } from "../components.jsx";
import { Chevron, ExtIcon, PenIcon, TrashIcon } from "../icons.jsx";
import { set } from "./state.js";
import { price } from "./pricing.js";
import { setQty, remove, chooseOption } from "./actions.js";
import { Offers } from "./offers.jsx";

function Qty({ r }) {
  return (
    <div class="l-qty">
      <NumField class="num" min={1} max={MAX_QTY} value={r.qty} aria-label={`Quantity of ${r.query}`}
        onCommit={n => setQty(r.id, n)} />
      <span class="l-steps">
        <button type="button" aria-label="One more" onClick={() => setQty(r.id, r.qty + 1)}>+</button>
        <button type="button" aria-label="One fewer" onClick={() => setQty(r.id, r.qty - 1)} disabled={r.qty <= 1}>−</button>
      </span>
    </div>
  );
}

function RowMenu({ r, c }) {
  return (
    <Menu label={`More for ${r.query}`}>
      <button type="button" role="menuitem" onClick={() => set({ editing: r.id, open: null })}><PenIcon />Change part</button>
      {c ? <a role="menuitem" href={safeUrl(c.url)} target="_blank" rel="noopener"><ExtIcon />Open at {c.shop_name}</a> : null}
      <button type="button" role="menuitem" class="danger" onClick={() => remove(r.id)}><TrashIcon />Remove</button>
    </Menu>
  );
}

// a product chosen by hand says so; why the plan took a pricier one is under the offers (Why)
const PickChip = ({ r, c }) => (isPick(r, c) ? <span class="l-chip pick">Your pick</span> : null);

// A pick the search didn't find (list-model.js pickState): still the row's product, shown with
// what its shop said, and not bought until another is chosen.
const HELD = {
  waiting: ["pick", "Your pick", shop => `Waiting for ${shop}`],
  checking: ["pick", "Your pick", shop => `Asking ${shop} about it`],
  out: ["warn", "Out of stock", shop => `Out of stock at ${shop}`],
  gone: ["bad", "No longer sold", shop => `${shop} no longer sells it`],
  unknown: ["warn", "Couldn't check", shop => `${shop} didn't answer`],
};
function Held({ r, n, open, toggle }) {
  const shop = SHOPS_BY_KEY[r.pinKey.split("|")[0]]?.name ?? "Its shop";
  const [, , say] = HELD[r.pickState] || HELD.checking;
  const busy = r.pickState === "waiting" || r.pickState === "checking";
  return (
    <div class="l-product held">
      {r.pick ? <Thumb class="l-thumb" p={r.pick} /> : null}
      <span class="l-product-text">
        <span class="l-product-name">{r.pick?.name ?? `Your pick at ${shop}`}</span>
        <span class="l-product-meta">
          {busy ? <span class="s-bar-anim" /> : null}{say(shop)}{busy ? "…" : " · not in the total"}
          {n && !busy ? <> · <button class="s-linkbtn" type="button" aria-expanded={open} onClick={toggle}>Choose another</button></> : null}
        </span>
      </span>
    </div>
  );
}

// The colour or size of a product sold in several. Chosen here, it's the row's pick, bought as it
// is and put in the cart from here. Which are out of stock is asked the first time it's opened.
function Options({ r, c }) {
  const [stock, setStock] = useState(null);
  const [busy, setBusy] = useState(false);
  const o = c.options;
  const ask = () => {
    if (stock) return;
    setStock({});
    const shop = SHOPS_BY_KEY[c.shop];
    for (const x of o.choices) {
      shop.check(x.ref, AbortSignal.timeout(SHOP_TIMEOUT_MS))
        .then(now => setStock(m => ({ ...m, [x.ref]: !!now?.in_stock && now.price > 0 })), () => {});
    }
  };
  const pick = async e => {
    setBusy(true);
    await chooseOption(r.id, c, e.currentTarget.value);
    setBusy(false);
  };
  const out = x => stock?.[x.ref] === false && x.ref !== o.chosen;
  return (
    <label class="l-option">
      <span>{o.what[0].toUpperCase() + o.what.slice(1)}</span>
      <select value={o.chosen || ""} disabled={busy} onFocus={ask} onPointerDown={ask} onChange={pick}>
        {o.chosen ? null : <option value="" disabled>Choose…</option>}
        {o.choices.map(x => <option key={x.ref} value={x.ref} disabled={out(x)}>{x.label}{out(x) ? " (out of stock)" : ""}</option>)}
      </select>
      {busy ? <span class="s-bar-anim" /> : null}
    </label>
  );
}

// `c` is the product the plan buys for the row, `open` whether its offers show, `flash` whether
// it just changed. It's drawn again only when one of those changed.
export const Row = memo(({ r, c, open, flash, filter }) => {
  const toggle = () => set({ open: open ? null : r.id });
  const n = r.line?.candidates.length || 0;
  let chip = null;
  let cost = null;
  let product;
  if (r.status === "waiting" || r.status === "searching") {
    product = (
      <div class="l-product empty"><span class="l-searching"><span class="s-bar-anim" />
        {r.status === "waiting" ? "Waiting its turn…" : `Asking the shops… ${r.done} of ${SHOPS.length}`}</span></div>
    );
  } else if (r.status === "error") {
    chip = <span class="l-chip bad">Not searched</span>;
    product = <div class="l-product empty">Couldn't search: {r.error} <button class="s-linkbtn" type="button" onClick={() => price([r.id])}>Try again</button></div>;
  } else if (held(r)) {
    const [cls, label] = HELD[r.pickState] || HELD.checking;
    chip = <span class={`l-chip ${cls}`}>{label}</span>;
    product = <Held r={r} n={n} open={open} toggle={toggle} />;
  } else if (!c) {
    chip = <span class="l-chip bad">{n ? "Check match" : "Not found"}</span>;
    const msg = n ? "Only look-alikes found. Open them to pick one yourself, or try a part number." : "No shop has this in stock. Try another name or a part number.";
    product = n
      ? <button class="l-product empty" type="button" aria-expanded={open} onClick={toggle}><span class="l-product-text">{msg}</span><Chevron class="l-chev" /></button>
      : <div class="l-product empty">{msg}</div>;
  } else {
    chip = <PickChip r={r} c={c} />;
    cost = money(lineCost(r.line, c));
    product = (
      <button class="l-product" type="button" aria-expanded={open} onClick={toggle} title={`${plural(n, "offer")}. Click to compare`}>
        <Thumb class="l-thumb" p={c} />
        <span class="l-product-text">
          <span class="l-product-name">{c.name}</span>
          <span class="l-product-meta"><span class="l-shop">{c.shop_name}</span> · {priceDetail(r.line, c)}</span>
        </span>
        <span class="l-chip soft l-count">{plural(n, "offer")}</span><Chevron class="l-chev" />
      </button>
    );
  }
  const below = [];
  if (c?.options && SHOPS_BY_KEY[c.shop]?.option) below.push(<Options key="options" r={r} c={c} />);
  // shown before the slowest shops answered: they may still bring a cheaper offer
  const late = pendingShops(r);
  if (late.length) below.push(<span key="late" class="l-late-note"><span class="s-bar-anim" />Waiting for {late.map(x => x.name).sort().join(", ")}</span>);
  if (below.length) product = <div class="l-prod">{product}{below}</div>;
  return (
    <div class={`l-row${flash ? " flash" : ""}${open ? " open" : ""}`} data-row={r.id}>
      <div class="l-row-main">
        <Qty r={r} />
        <div class="l-name-line"><span class="l-part" title={r.query}>{r.query}</span>{chip}</div>
        <div class="l-cost num">{cost ?? "—"}</div>
        <div class="l-acts"><RowMenu r={r} c={c || (held(r) && r.pick ? { ...r.pick, shop_name: SHOPS_BY_KEY[r.pick.shop]?.name } : null)} /></div>
        {product}
      </div>
      {open && n ? <Offers r={r} c={c} filter={filter} /> : null}
    </div>
  );
});

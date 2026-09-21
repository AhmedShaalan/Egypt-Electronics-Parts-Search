// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A part on the list: its quantity, what the plan buys for it and at what cost, and its offers.

import { SHOPS } from "../../shops.js";
import { lineCost } from "../../search.js";
import { MAX_QTY, cheapestGood, weakCheaper, isPick } from "../../list-model.js";
import { money, safeUrl, priceDetail } from "../common.js";
import { plural } from "../format.js";
import { Thumb, Menu, NumField, memo } from "../components.jsx";
import { Chevron, ExtIcon, PenIcon, TrashIcon } from "../icons.jsx";
import { set } from "./state.js";
import { price } from "./pricing.js";
import { setQty, remove } from "./actions.js";
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

// why the plan took this product, when a cheaper one was there; in full under the offers (Why)
function WhyChip({ r, c }) {
  if (isPick(r, c)) return <span class="l-chip pick">Your pick</span>;
  const low = cheapestGood(r.line);
  if (low && lineCost(r.line, low) < lineCost(r.line, c)) {
    return <span class="l-chip soft" title={`${money(lineCost(r.line, c) - lineCost(r.line, low))} more here, one delivery fewer`}>Saves a delivery</span>;
  }
  if (weakCheaper(r.line, c)) return <span class="l-chip warn" title="A cheaper look-alike was skipped because it's probably a different part">Look-alike skipped</span>;
  return null;
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
  } else if (!c) {
    chip = <span class="l-chip bad">{n ? "Check match" : "Not found"}</span>;
    const msg = n ? "Only look-alikes found. Open them to pick one yourself, or try a part number." : "No shop has this in stock. Try another name or a part number.";
    product = n
      ? <button class="l-product empty" type="button" aria-expanded={open} onClick={toggle}><span class="l-product-text">{msg}</span><Chevron class="l-chev" /></button>
      : <div class="l-product empty">{msg}</div>;
  } else {
    chip = <WhyChip r={r} c={c} />;
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
  const gone = r.pickGone && r.pin == null
    ? <span class="l-chip warn" title="The product chosen for this part is sold out or gone, so the plan chose again">Your pick is gone</span> : null;
  return (
    <div class={`l-row${flash ? " flash" : ""}${open ? " open" : ""}`} data-row={r.id}>
      <div class="l-row-main">
        <Qty r={r} />
        <div class="l-name-line"><span class="l-part" title={r.query}>{r.query}</span>{chip}{gone}</div>
        <div class="l-cost num">{cost ?? "—"}</div>
        <div class="l-acts"><RowMenu r={r} c={c} /></div>
        {product}
      </div>
      {open && n ? <Offers r={r} c={c} filter={filter} /> : null}
    </div>
  );
});

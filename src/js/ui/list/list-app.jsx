// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Parts list tab. Parts typed or pasted in become rows, each priced at every shop as it's
// added, and edited in place. Beside them, the order: how to buy, delivery fees, and one basket
// per shop with its cart. A list is named and saved in this browser.

import { useEffect, useState } from "preact/hooks";
import { priced } from "../../list-model.js";
import { $ } from "../common.js";
import { Money } from "../components.jsx";
import { plural } from "../format.js";
import { store, set, plansNow, rowById, hasUnsaved, isSavedList } from "./state.js";
import { Head, ShopsStatus, Intake } from "./head.jsx";
import { Row } from "./row.jsx";
import { Order } from "./order.jsx";
import { progress } from "./pricing.js";
import { ChangeDialog } from "./change-dialog.jsx";
import { DiscardDialog } from "./discard-dialog.jsx";
import { save } from "./actions.js";

// Floats over the list while it has changes to save, once the Save button at the top has
// scrolled away
function SaveBar() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const head = document.querySelector("#tab-list .l-head");
    if (!head) return;
    const watch = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { threshold: 0 });
    watch.observe(head);
    return () => watch.disconnect();
  }, []);
  if (!away || !hasUnsaved()) return null;
  return (
    <div class="l-savebar">
      <span class="l-savebar-state" role="status"><span class="l-dot" />Unsaved changes</span>
      <span class="l-savebar-btns">
        <button class="btn small" type="button" onClick={() => set({ discarding: true })}>Discard</button>
        <button class="btn primary small" type="button" onClick={save}>{isSavedList() ? "Save changes" : "Save"}</button>
      </span>
    </div>
  );
}

export function ListApp() {
  const s = store.use();
  const { plans, strategy, plan } = plansNow();
  const found = s.rows.filter(r => plan?.assign.has(r.id)).length;
  const { n, settled, final } = progress();
  return <>
    <Head s={s} />
    <ShopsStatus s={s} />
    <div class="l-layout">
      <div class="l-list-wrap" role="region" aria-label="Parts">
        <div class="l-list">
          <Intake />
          {s.rows.length
            ? <div class="l-cols" aria-hidden="true"><span>Qty</span><span>Part · what you'd buy</span><span>Cost</span><span /></div>
            : null}
          {s.rows.map(r => (
            <Row key={r.id} r={r} c={priced(r) ? plan?.assign.get(r.id) : null}
              open={s.open === r.id} flash={s.flash.has(r.id)} filter={s.filters[r.id] || ""} />
          ))}
        </div>
      </div>
      <Order s={s} plans={plans} strategy={strategy} plan={plan} />
    </div>
    {s.rows.length
      ? <div class="l-mobile-bar">
          <div>
            <div class={`t num${final ? "" : " so-far"}`}>{plan ? <Money value={plan.total} /> : "—"}</div>
            <div class="s">{final
              ? `${plural(found, "part")} · ${plural(plan?.used.size || 0, "shop")} · delivery incl.`
              : settled < n ? `Pricing ${settled} of ${n} parts…` : "Almost done · waiting for a shop or two"}</div>
          </div>
          <button class="btn primary" type="button" onClick={() => $("#order").scrollIntoView({ behavior: "smooth" })}>View order</button>
        </div>
      : null}
    <SaveBar />
    <ChangeDialog r={s.editing != null ? rowById(s.editing) : null} />
    <DiscardDialog />
  </>;
}

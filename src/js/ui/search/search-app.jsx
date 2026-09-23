// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Search tab: one part searched at every shop. Results fill in as the shops answer, the same
// product at different shops is one card, and a side panel filters by shop.

import { useEffect, useMemo } from "preact/hooks";
import { SHOPS } from "../../shops.js";
import { $ } from "../common.js";
import { store, runSearch, setRecent } from "./state.js";
import { viewOf } from "./view.js";
import { Status, Filters } from "./panels.jsx";
import { Results } from "./results.jsx";

const EXAMPLES = ["Arduino Uno", "LM7805", "ESP32", "10k resistor"];

function Intro({ s }) {
  const chip = q => <button class="s-q-chip" type="button" key={q} onClick={() => runSearch(q)}>{q}</button>;
  return (
    <div class="s-intro">
      <div class="s-recent">
        {s.recent.length
          ? <><span class="s-lbl">Recent</span>{s.recent.map(chip)}<button class="s-linkbtn" type="button" onClick={() => setRecent([])}>Clear</button></>
          : <><span class="s-lbl">Try</span>{EXAMPLES.map(chip)}</>}
      </div>
      <ul class="s-facts">
        <li>{SHOPS.length} shops searched at once</li><li>In stock only</li><li>Per-piece price for packs</li><li>No account, nothing to install</li>
      </ul>
    </div>
  );
}

export function SearchApp() {
  const s = store.use();
  useEffect(() => { $("#tab-search").classList.toggle("has-query", !!s.query); }, [s.query]);
  const v = useMemo(() => viewOf(s), [s.result, s.hidden, s.saleOnly, s.cartOnly]);
  if (!s.query) return <Intro s={s} />;
  return <>
    <Status s={s} v={v} />
    <div class={`s-layout${s.showFilters ? " show-filters" : ""}`}>
      <Filters s={s} v={v} />
      <Results s={s} v={v} />
    </div>
  </>;
}

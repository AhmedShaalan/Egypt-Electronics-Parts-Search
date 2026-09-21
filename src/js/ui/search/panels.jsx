// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Around the results: the status line (which shops answered) and the filters by shop.

import { plural } from "../format.js";
import { copy } from "../copy.js";
import { CopyIcon } from "../icons.jsx";
import { set, askAgain, skipWaiting } from "./state.js";
import { canCart } from "./view.js";

export function Status({ s, v }) {
  const total = v.shops.length;
  if (v.busy) {
    return (
      <div class="s-status">
        <span class="s-bar-anim" />
        <span>Searching {total} shops… <b>{v.answered}</b> answered</span>
        <button class="s-linkbtn" type="button" onClick={skipWaiting}>Stop waiting</button>
      </div>
    );
  }
  const ok = v.shops.filter(x => x.ok).length;
  const failed = v.shops.filter(x => !x.ok && !x.skipped && !s.fetching.has(x.key));
  const skipped = v.shops.filter(x => x.skipped && !s.fetching.has(x.key));
  const asking = v.shops.filter(x => s.fetching.has(x.key));
  const minutes = s.result?.cached ? Math.round((Date.now() - Date.parse(s.result.searched_at)) / 60000) : 0;
  return (
    <div class="s-status">
      <span>Prices from <b>{ok} of {total} shops</b>, checked {minutes >= 1 ? `${plural(minutes, "minute")} ago` : "just now"}</span>
      {failed.map(x => <span key={x.key} class="s-status-item">
        <span class="s-fail" title={x.error}>{x.name} didn't answer</span>
        <button class="s-linkbtn" type="button" onClick={() => askAgain(x.key)}>Try again</button>
      </span>)}
      {asking.map(x => <span key={x.key}>Asking {x.name} again…</span>)}
      {skipped.length > 0 && <span class="s-status-item">
        <span>{skipped.length} skipped</span>
        <button class="s-linkbtn" type="button" onClick={() => skipped.forEach(x => askAgain(x.key))}>Search {skipped.length === 1 ? "it" : "them"} too</button>
      </span>}
      <button class="btn small s-share" type="button" title="Copy a link to these results" onClick={() => copy(location.href)}><CopyIcon /> Copy link</button>
    </div>
  );
}

export function Filters({ s, v }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const withMatches = v.shops.filter(x => x.ok && v.matchCount(x.key)).sort(byName);
  const waiting = v.shops.filter(x => x.pending || s.fetching.has(x.key)).sort(byName);
  const problems = v.shops.filter(x => !x.ok && !x.pending && !s.fetching.has(x.key)).sort(byName);
  const none = v.shops.filter(x => x.ok && !v.matchCount(x.key) && !s.fetching.has(x.key)).sort(byName);
  const saleN = v.strongAll.filter(p => p.old_price).length;
  const cartN = v.strongAll.filter(canCart).length;
  const toggleShop = (shopKey, on) => {
    const hidden = new Set(s.hidden);
    on ? hidden.delete(shopKey) : hidden.add(shopKey);
    set({ hidden });
  };
  const only = shopKey => set({ hidden: new Set(v.shops.map(x => x.key).filter(k => k !== shopKey)) });
  return (
    <aside class="s-filters" aria-label="Filters">
      <div class="s-f-head"><h3>Shops</h3>{s.hidden.size > 0 && <button class="s-linkbtn" type="button" onClick={() => set({ hidden: new Set() })}>Show all</button>}</div>
      <div class="s-f-sec">
        {withMatches.map(x => (
          <div class="s-f-row" key={x.key}>
            <label><input type="checkbox" checked={!s.hidden.has(x.key)} onChange={e => toggleShop(x.key, e.currentTarget.checked)} /><span class="s-f-name">{x.name}</span></label>
            <button class="s-f-only" type="button" title={`Show only ${x.name}`} onClick={() => only(x.key)}>Only</button>
            <span class="s-f-count">{v.matchCount(x.key)}</span>
          </div>
        ))}
        {waiting.map(x => <div class="s-f-row wait" key={x.key}><span class="s-dot" /><span class="s-f-name">{x.name}</span><span class="s-f-count">…</span></div>)}
        {problems.map(x => (
          <div class="s-f-row problem" key={x.key}>
            <span class="s-f-name">{x.name}<br /><span class={`s-why${x.skipped ? "" : " fail"}`} title={x.error}>{x.skipped ? "Skipped" : "Didn't answer"}</span></span>
            <button class="s-linkbtn" type="button" onClick={() => askAgain(x.key)}>{x.skipped ? "Search now" : "Try again"}</button>
          </div>
        ))}
        {none.length > 0 && <details class="s-f-none"><summary>{plural(none.length, "shop")} had no match</summary><p>{none.map(x => x.name).join(", ")}</p></details>}
      </div>
      <div class="s-f-head"><h3>Only show</h3></div>
      <div class="s-f-sec">
        <div class="s-f-row"><label><input type="checkbox" checked={s.saleOnly} onChange={e => set({ saleOnly: e.currentTarget.checked })} /><span class="s-f-name">On sale</span></label><span class="s-f-count">{saleN}</span></div>
        <div class="s-f-row" title="Shops whose cart can be filled from this site"><label><input type="checkbox" checked={s.cartOnly} onChange={e => set({ cartOnly: e.currentTarget.checked })} /><span class="s-f-name">Can add to cart from here</span></label><span class="s-f-count">{cartN}</span></div>
      </div>
    </aside>
  );
}

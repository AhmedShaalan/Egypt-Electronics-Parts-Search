// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Saved tab: starred items, with how their prices moved since they were starred, and saved
// parts lists as cards. Everything is kept in this browser, so it can be backed up to a file.

import { useRef } from "preact/hooks";
import { currentSaved } from "../saved.js";
import { DownloadIcon, UploadIcon } from "../icons.jsx";
import { store, setTab, backUp, restoreFrom } from "./state.js";
import { Items, BulkBar } from "./items.jsx";
import { Lists, RenameDialog } from "./lists.jsx";

const TABS = ["items", "lists"];

// the arrow keys, Home and End move between the tabs, choosing as they go
function onTabKey(e) {
  const i = TABS.indexOf(store.state.tab);
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (to == null) return;
  e.preventDefault();
  const tab = TABS[(to + TABS.length) % TABS.length];
  setTab(tab);
  document.getElementById(`saved-${tab}`).focus();
}

export function SavedApp() {
  const s = store.use();
  const { items, lists } = currentSaved();
  const fileInput = useRef(null);
  const tab = (id, label, n) => (
    <button type="button" role="tab" id={`saved-${id}`} aria-selected={s.tab === id} aria-controls="saved-pane"
      tabindex={s.tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={onTabKey}>
      {label}<span class="v-n">{n}</span>
    </button>
  );
  return <>
    <div class="v-head">
      <div>
        <h1>Saved</h1>
        <p class="v-sub">Kept in this browser only. Clearing its data removes them, so back up once in a while.</p>
      </div>
      <div class="v-head-actions">
        <button class="btn small v-ghost" type="button" onClick={backUp} disabled={!items.length && !lists.length}><DownloadIcon /> Back up</button>
        <button class="btn small v-ghost" type="button" onClick={() => fileInput.current.click()}><UploadIcon /> Restore</button>
        <input type="file" accept="application/json,.json" ref={fileInput} hidden onChange={e => { restoreFrom(e.currentTarget.files[0]); e.currentTarget.value = ""; }} />
      </div>
    </div>
    <div class="v-tabs" role="tablist" aria-label="Saved">
      {tab("items", "Starred items", items.length)}{tab("lists", "Parts lists", lists.length)}
    </div>
    <div id="saved-pane" role="tabpanel" aria-labelledby={`saved-${s.tab}`}>
      {s.tab === "items" ? <Items s={s} items={items} /> : <Lists s={s} lists={lists} />}
    </div>
    <BulkBar s={s} items={items} />
    <RenameDialog list={s.renaming} />
  </>;
}

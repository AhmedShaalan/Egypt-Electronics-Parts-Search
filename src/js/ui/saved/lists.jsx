// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Saved parts lists as cards, each opening in the Parts list tab.

import { useRef } from "preact/hooks";
import { renameList } from "../../search.js";
import { money, toast, NO_AUTOFILL } from "../common.js";
import { plural, num, ago } from "../format.js";
import { partCount, reloadSaved } from "../saved.js";
import { openSavedList, startNewList } from "../list/index.js";
import { Menu } from "../components.jsx";
import { useModal } from "../use-modal.js";
import { CopyIcon, DupIcon, OpenIcon, PenIcon, PlusIcon, RefreshIcon, TrashIcon } from "../icons.jsx";
import { set, updateLists, removeList, duplicate, listParts, copyList } from "./state.js";

function ListCard({ l, s }) {
  const parts = listParts(l);
  const preview = parts.slice(0, 4);
  const updating = s.updating.has(l.id);
  const moved = s.moved.get(l.id);
  const priced = l.saved_total != null;
  // the whole card opens the list; its buttons and menu do their own thing
  const open = e => { if (!e.target.closest("button, a, details")) openSavedList(l.id); };
  return (
    <article class={`v-lcard${updating ? " updating" : ""}`} onClick={open}>
      <div class="v-l-head">
        <button class="v-l-name" type="button" title={`Open ${l.name}`} onClick={() => openSavedList(l.id)}>{l.name}</button>
        <Menu label={`More for ${l.name}`}>
          <button type="button" role="menuitem" onClick={() => openSavedList(l.id)}><OpenIcon /> Open</button>
          <button type="button" role="menuitem" onClick={() => updateLists([l.id])}><RefreshIcon /> Update prices</button>
          <button type="button" role="menuitem" onClick={() => set({ renaming: l })}><PenIcon /> Rename…</button>
          <button type="button" role="menuitem" onClick={() => duplicate(l)}><DupIcon /> Duplicate</button>
          <button type="button" role="menuitem" onClick={() => copyList(l, false)}><CopyIcon /> Copy parts</button>
          {priced && <button type="button" role="menuitem" onClick={() => copyList(l, true)}><CopyIcon /> Copy parts and total</button>}
          <hr />
          <button type="button" role="menuitem" class="danger" onClick={() => removeList(l)}><TrashIcon /> Delete</button>
        </Menu>
      </div>
      <div class="v-l-meta">
        {plural(partCount(l), "part")} · {priced
          ? <><b>{money(l.saved_total)}</b>{l.saved_shops ? ` from ${plural(l.saved_shops, "shop")}` : ""}
              {moved ? <span class={`v-delta ${moved < 0 ? "down" : "up"}`} title={`${moved < 0 ? "Cheaper" : "Pricier"} than the last time it was priced`}>{moved < 0 ? "▼" : "▲"} {num(Math.abs(moved))} EGP</span> : null}
              {l.changed && <span class="s-chip soft" title="Parts were added after it was priced">changed since</span>}</>
          : "not priced yet"}
      </div>
      <ul class="v-l-parts">
        {preview.map((p, i) => <li key={i}>{p}</li>)}
        {parts.length > preview.length && <li class="v-more">+{parts.length - preview.length} more</li>}
      </ul>
      <div class="v-l-foot">
        {priced ? `Prices from ${ago(l.priced_at || l.saved_at)}` : `Saved ${ago(l.saved_at)}`}
        {updating
          ? <span class="v-l-updating"><span class="v-spin small" />Updating prices…</span>
          : <button class="s-icon v-l-refresh" type="button" title="Update prices" aria-label={`Update prices of ${l.name}`} onClick={() => updateLists([l.id])}><RefreshIcon /></button>}
      </div>
    </article>
  );
}

export function Lists({ s, lists }) {
  return <>
    <div class="v-cards">
      {lists.map(l => <ListCard key={l.id} l={l} s={s} />)}
      <button class="v-lcard new" type="button" onClick={startNewList}><PlusIcon /> New parts list</button>
    </div>
    {!lists.length && <p class="v-hint">Price a parts list, then save it, and it shows up here to open again later.</p>}
  </>;
}

export function RenameDialog({ list }) {
  const input = useRef(null);
  const modal = useModal(list, () => {
    input.current.value = list.name;
    input.current.select();
  });
  const submit = e => {
    e.preventDefault();
    const name = input.current.value.trim();
    if (!name) return input.current.focus();
    renameList(list.id, name);
    modal.close();
    reloadSaved();
    toast("Renamed");
  };
  return (
    <dialog class="modal" {...modal.props} aria-labelledby="rename-title" onClose={() => set({ renaming: null })}>
      <form onSubmit={submit}>
        <h2 id="rename-title">Rename list</h2>
        <label class="modal-label" for="rename-input">Name</label>
        <input type="text" id="rename-input" ref={input} maxlength="80" {...NO_AUTOFILL} style="width:100%" />
        <div class="modal-actions">
          <button type="button" class="btn" onClick={modal.close}>Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Above the rows: the list's name, saving and the saved lists, the shops that didn't answer, and
// the box parts are typed or pasted into.

import { useRef } from "preact/hooks";
import { SHOPS, SHOPS_BY_KEY } from "../../shops.js";
import { priced, listText } from "../../list-model.js";
import { NO_AUTOFILL } from "../common.js";
import { plural } from "../format.js";
import { copy } from "../copy.js";
import { currentSaved, partCount } from "../saved.js";
import { Menu } from "../components.jsx";
import { Chevron, CopyIcon, PlusIcon } from "../icons.jsx";
import { set, isDirty, isSavedList } from "./state.js";
import { failedShops, lateShops, retryShops } from "./pricing.js";
import { addText, save, openSavedList, startNewList } from "./actions.js";

export function Head({ s }) {
  const lists = currentSaved().lists;
  const dirty = isDirty();
  const saved = isSavedList();
  const label = !s.rows.length && !saved ? null : !saved ? "Not saved" : dirty ? "Unsaved changes" : "Saved";
  return (
    <div class="l-head">
      <input class="l-name" value={s.name} size={Math.max(4, s.name.length)} maxlength="80" aria-label="List name" spellcheck={false} {...NO_AUTOFILL}
        onInput={e => set({ name: e.currentTarget.value })} />
      {label ? <span class={`l-save-state${dirty ? " dirty" : ""}`} role="status"><span class="l-dot" />{label}</span> : null}
      <div class="l-head-actions">
        <button class="btn primary" type="button" disabled={!dirty || !s.rows.length} onClick={save}>{dirty || !saved ? (saved ? "Save changes" : "Save") : "Saved"}</button>
        <Menu class="l-lists" summary={<summary class="btn">My lists<Chevron class="l-chev" /></summary>}>
          {lists.map(l => (
            <button type="button" role="menuitem" key={l.id} onClick={() => openSavedList(l.id)} aria-current={l.id === s.listId ? "true" : null}>
              <span class="l-menu-name">{l.name}</span><small>{plural(partCount(l), "part")}</small>
            </button>
          ))}
          {lists.length ? <hr /> : null}
          <button type="button" role="menuitem" onClick={startNewList}><PlusIcon />New list</button>
          <button type="button" role="menuitem" disabled={!s.rows.length} onClick={() => copy(listText(s.rows))}><CopyIcon />Copy as text</button>
        </Menu>
      </div>
    </div>
  );
}

export function ShopsStatus({ s }) {
  if (!s.rows.some(priced)) return null;
  const failed = failedShops();
  const late = lateShops();
  const names = shops => shops.map(f => f.name || SHOPS_BY_KEY[f.key]?.name).join(", ");
  return (
    <div class="l-status">
      <span>Prices from <b>{SHOPS.length - failed.length - late.length} of {SHOPS.length} shops</b></span>
      {failed.length ? <>
        <span class="l-fail">{names(failed)} didn't answer</span>
        <button class="s-linkbtn" type="button" disabled={s.retrying} onClick={retryShops}>{s.retrying ? "Asking again…" : "Try again"}</button>
      </> : null}
    </div>
  );
}

export function Intake() {
  const box = useRef(null);
  const add = () => {
    if (addText(box.current.value)) box.current.value = "";
    box.current.focus();
  };
  return (
    <div class="l-intake">
      <label for="list-text">Add parts</label>
      <textarea id="list-text" ref={box} rows="3" spellcheck={false} autocomplete="off"
        placeholder={"One part per line, or paste a whole list:\nLM7805 x2\n10k resistor, 20"}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
      <div class="l-intake-foot">
        <span class="l-hint">Quantity: <code>x2</code>, <code>2x</code>, <code>2pcs</code>, or a count in front or after a comma. <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> adds.</span>
        <button class="btn primary" type="button" onClick={add}>Add to list</button>
      </div>
    </div>
  );
}

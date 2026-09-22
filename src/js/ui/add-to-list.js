// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The dialog that adds a search result to a saved parts list.

import { getSaved, addToList } from "../search.js";
import { $, esc, toast, onBackdrop } from "./common.js";
import { currentSaved, partCount, reloadSaved } from "./saved.js";
import { openSavedList, addedToList } from "./list/index.js";

let lastListId = null; // the list picked last time is picked again, for adding several parts in a row

// the list something was added to last, while it still exists, for adding the next part in one click
export const lastList = () => currentSaved().lists.find(l => l.id === lastListId) || null;

// the products' names go in as lines of the list, the first making a new list when `id` is null.
// Each goes in at the top, so they're added last first to keep their order.
function addAll(id, ps, newName) {
  let list = null;
  for (const p of [...ps].reverse()) {
    list = addToList(id, p.name, newName);
    id = list.id;
  }
  reloadSaved();
  addedToList(list.id, ps.map(p => p.name));
  lastListId = list.id;
  toast(`Added ${ps.length === 1 ? "" : `${ps.length} items `}to “${list.name}”`, { label: "Open list", run: () => openSavedList(list.id) });
  return list;
}

export function addToLastList(p) {
  const last = lastList();
  if (!last) return openAddToList(p);
  try { addAll(last.id, [p]); } catch (err) { toast(err.message); }
}

// `p` is a product or several; `onAdded` is called once they're in a list
export function openAddToList(p, { onAdded } = {}) {
  const ps = Array.isArray(p) ? p : [p];
  const dialog = $("#add-dialog");
  const lists = getSaved().lists;
  const picked = lists.some(l => l.id === lastListId) ? lastListId : lists[0]?.id;
  const newName = "Parts list " + new Date().toLocaleDateString();
  const nameInput = `<input type="text" id="add-name" value="${esc(newName)}" maxlength="80" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" aria-label="Name of the new list">`;
  $("#add-item").textContent = ps.length === 1 ? `${ps[0].name} · ${ps[0].shop_name}` : `${ps.length} items`;
  $("#add-picks").innerHTML = lists.length ? `
    <span class="modal-label">Choose a list</span>
    <div class="picks">
      ${lists.map(l => `
        <label class="pick">
          <input type="radio" name="add-to" value="${l.id}" ${l.id === picked ? "checked" : ""}>
          <span class="grow"><span class="pick-name">${esc(l.name)}</span>
            <span class="pick-meta">${partCount(l)} part${partCount(l) === 1 ? "" : "s"}</span></span>
        </label>`).join("")}
      <label class="pick">
        <input type="radio" name="add-to" value="new">
        <span class="grow"><span class="pick-name">New list</span>${nameInput}</span>
      </label>
    </div>`
    : `<label class="modal-label" for="add-name">You have no parts lists yet. Name a new one:</label>${nameInput}`;
  const name = $("#add-name");
  if (!lists.length) name.style.width = "100%";
  // typing a name means a new list
  name.addEventListener("focus", () => { const r = dialog.querySelector('input[value="new"]'); if (r) r.checked = true; });

  dialog.onsubmit = e => {
    e.preventDefault();
    const choice = dialog.querySelector('input[name="add-to"]:checked')?.value ?? "new";
    const id = choice === "new" ? null : +choice;
    if (id === null && !name.value.trim()) { name.focus(); return; }
    try {
      addAll(id, ps, name.value);
      dialog.close();
      onAdded?.();
    } catch (err) { reloadSaved(); toast(err.message); }
  };
  dialog.showModal();
  if (lists.length) dialog.querySelector('input[name="add-to"]:checked').focus();
  else name.select();
}

$("#add-cancel").addEventListener("click", () => $("#add-dialog").close());
// a click on the dimmed backdrop closes it too
$("#add-dialog").addEventListener("click", e => { if (onBackdrop(e)) e.currentTarget.close(); });

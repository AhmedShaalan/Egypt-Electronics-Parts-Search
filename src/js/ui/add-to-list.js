// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The dialog that adds a search result to a saved parts list.

import { getSaved, addToList } from "../search.js";
import { $, esc, toast } from "./common.js";
import { partCount, reloadSaved } from "./saved.js";

let lastListId = null; // the list picked last time is picked again, for adding several parts in a row

export function openAddToList(p) {
  const dialog = $("#add-dialog");
  const lists = getSaved().lists;
  const picked = lists.some(l => l.id === lastListId) ? lastListId : lists[0]?.id;
  const newName = "Parts list " + new Date().toLocaleDateString();
  const nameInput = `<input type="text" id="add-name" value="${esc(newName)}" maxlength="80" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" aria-label="Name of the new list">`;
  $("#add-item").textContent = `${p.name} · ${p.shop_name}`;
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
      const list = addToList(id, p.name, name.value);
      reloadSaved();
      lastListId = list.id;
      dialog.close();
      toast(`Added to “${list.name}”`);
    } catch (err) { toast(err.message); }
  };
  dialog.showModal();
  if (lists.length) dialog.querySelector('input[name="add-to"]:checked').focus();
  else name.select();
}

$("#add-cancel").addEventListener("click", () => $("#add-dialog").close());
// a click on the dimmed backdrop closes it too
$("#add-dialog").addEventListener("click", e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Saved tab: starred items and saved parts lists, all kept in this browser.

import { getSaved, saveItem as storeItem, unsaveItem as storeUnsave, deleteItem, refreshItems, renameList, deleteList } from "../search.js";
import { $, esc, money, toast, key, thumb, safeUrl } from "./common.js";
import { COPY_FORMATS, copy, copyText, copyMenu } from "./copy.js";
import { runList } from "./list-tab.js";

let saved = { items: [], lists: [] };
let savedKeys = new Set();

// the stored items and lists, read again after something else changed them
export function reloadSaved() {
  saved = getSaved();
  savedKeys = new Set(saved.items.map(key));
  updateSavedCount();
}

export const isSaved = p => savedKeys.has(key(p));

// the star toggles: starred items are saved, tapping a filled star removes them again
export async function toggleSave(p, btn) {
  try {
    const on = !savedKeys.has(key(p));
    if (on) { storeItem(p); savedKeys.add(key(p)); } else { storeUnsave(p); savedKeys.delete(key(p)); }
    if (btn) {
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on);
      btn.title = btn.ariaLabel = on ? "Remove from saved" : "Save";
    }
    updateSavedCount();
    toast(on ? "Saved" : "Removed");
  } catch (e) { toast(e.message); }
}

// the tab counts saved items and saved parts lists
export function updateSavedCount() {
  const { items, lists } = getSaved();
  $("#saved-count").textContent = items.length + lists.length;
}

// what the menu on a saved parts list can copy
const listParts = l => l.text.split("\n").map(x => x.trim()).filter(Boolean).join("\n");
export const partCount = l => l.text.split("\n").filter(x => x.trim()).length;
const LIST_COPY_FORMATS = [
  { label: "Parts", text: l => `${l.name}\n\n${listParts(l)}` },
  { label: "Parts and total", text: l => `${l.name}\n\n${listParts(l)}${l.saved_total ? `\n\nTotal when saved: ${money(l.saved_total)}` : ""}` },
];

export async function loadSaved(refresh = false) {
  const out = $("#saved-out");
  if (!refresh && !saved.items.length && !saved.lists.length) out.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    if (refresh) {
      const r = await refreshItems();
      saved.items = r.items;
      toast(r.failed ? `Updated, but ${r.failed} item${r.failed === 1 ? "" : "s"} couldn't be checked` : "Prices updated");
    } else {
      saved = getSaved();
    }
    savedKeys = new Set(saved.items.map(key));
    updateSavedCount();
    renderSaved();
  } catch (e) {
    out.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderSaved() {
  const out = $("#saved-out");
  const { items, lists } = saved;
  const lastCheck = items.map(i => i.checked_at).sort().pop();
  const buyable = it => it.available && it.in_stock;
  const unbuyable = items.filter(it => !buyable(it)).length;
  out.innerHTML = `
    <div class="toolbar" style="margin-top:0">
      <div class="grow">
        <h2 class="with-copy">Saved items
          ${items.length ? copyMenu("Copy list") : ""}
        </h2>
        ${items.length ? `<div class="meta">${items.length} saved item${items.length === 1 ? "" : "s"}${lastCheck ? ` · prices checked ${esc(when(lastCheck))}` : ""}</div>` : ""}
      </div>
      ${items.length ? `<button class="btn" id="refresh">↻ Refresh prices</button>` : ""}
    </div>
    ${items.length ? `<div class="list">${items.map(savedRow).join("")}</div>
      <div class="total-bar">
        <span>${items.length} item${items.length === 1 ? "" : "s"}${unbuyable ? ` · ${unbuyable} out of stock, not counted` : ""}</span>
        <span class="total">Total ${money(items.filter(buyable).reduce((sum, it) => sum + it.price, 0))}</span>
      </div>`
      : `<div class="empty boxed">Nothing saved yet. Tap ☆ on a search result to save it.</div>`}

    <h2>Saved parts lists</h2>
    ${lists.length ? `<div class="list">${lists.map(l => `
      <div class="row" style="grid-template-columns:1fr auto">
        <div>
          <button class="name link" data-open-list="${l.id}">${esc(l.name)}</button>
          <div class="meta">${partCount(l)} part${partCount(l) === 1 ? "" : "s"} · saved ${esc(when(l.saved_at))}${l.saved_total ? ` at ${money(l.saved_total)}` : ""}</div>
        </div>
        <div class="actions">
          <details class="menu right">
            <summary class="icon-btn" title="More" aria-label="More actions">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </summary>
            <div class="menu-list" role="menu">
              <button type="button" role="menuitem" data-rename-list="${l.id}">Rename</button>
              <div class="menu-title">Copy</div>
              ${LIST_COPY_FORMATS.map((f, i) => `<button type="button" role="menuitem" data-copy-list="${l.id}" data-format="${i}">${f.label}</button>`).join("")}
              <div class="menu-sep"></div>
              <button type="button" role="menuitem" class="danger" data-del-list="${l.id}">Delete</button>
            </div>
          </details>
        </div>
      </div>`).join("")}</div>`
      : `<div class="empty boxed">No saved lists. Price a parts list, then tap “Save this list”.</div>`}
  `;

  out.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    b.closest("details").open = false;
    const which = b.dataset.item ? items.filter(it => it.id === +b.dataset.item) : items;
    copy(copyText(which, COPY_FORMATS[+b.dataset.copy]));
  });
  $("#refresh")?.addEventListener("click", async e => {
    e.target.disabled = true;
    e.target.textContent = "Checking…";
    await loadSaved(true);
  });
  out.querySelectorAll("[data-del-item]").forEach(b => b.onclick = async () => {
    if (!confirm("Remove this saved item?")) return;
    deleteItem(+b.dataset.delItem);
    loadSaved();
  });
  out.querySelectorAll("[data-rename-list]").forEach(b => b.onclick = () => {
    b.closest("details").open = false;
    const l = lists.find(x => x.id === +b.dataset.renameList);
    const name = prompt("Rename this list", l.name);
    if (name === null || !name.trim()) return;
    renameList(l.id, name);
    toast("Renamed");
    loadSaved();
  });
  out.querySelectorAll("[data-copy-list]").forEach(b => b.onclick = () => {
    b.closest("details").open = false;
    const l = lists.find(x => x.id === +b.dataset.copyList);
    copy(LIST_COPY_FORMATS[+b.dataset.format].text(l));
  });
  out.querySelectorAll("[data-del-list]").forEach(b => b.onclick = async () => {
    b.closest("details").open = false;
    if (!confirm("Delete this saved list?")) return;
    deleteList(+b.dataset.delList);
    loadSaved();
  });
  out.querySelectorAll("[data-open-list]").forEach(b => b.onclick = () => {
    const l = lists.find(x => x.id === +b.dataset.openList);
    $("#list-text").value = l.text;
    location.hash = "#list";
    runList(l.text, l);
  });
}

function savedRow(it) {
  const diff = it.price - it.saved_price;
  let status = "";
  if (!it.available) status = '<span class="badge bad">No longer listed</span>';
  else if (!it.in_stock) status = '<span class="badge bad">Out of stock</span>';
  const delta = Math.abs(diff) >= 0.01
    ? `<span class="delta ${diff < 0 ? "down" : "up"}">${diff < 0 ? "▼" : "▲"} ${money(Math.abs(diff))}</span>` : "";
  return `
    <div class="row">
      ${thumb(it)}
      <div>
        <a class="name" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.name)}</a>
        <div class="meta">${esc(it.shop_name)} · price when saved ${money(it.saved_price)} ${status}</div>
      </div>
      <div class="actions">
        <div class="price"><b>${money(it.price)}</b>${delta ? `<span class="per">${delta}</span>` : ""}</div>
        ${copyMenu("Copy this item", it.id)}
        <button class="star" data-del-item="${it.id}" title="Remove" aria-label="Remove">✕</button>
      </div>
    </div>`;
}

function when(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString();
}

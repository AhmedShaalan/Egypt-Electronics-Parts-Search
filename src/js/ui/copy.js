// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Copying results and saved items to the clipboard, and the small menus that offer the formats.

import { esc, money, toast } from "./common.js";

// what the copy menu on the saved tab can put on the clipboard. Short formats are one item per
// line; the one with links gives each item its own block. Lists with prices end with the total.
const oneLine = it => it.name.replace(/\s+/g, " ").trim();
export const COPY_FORMATS = [
  { label: "Names", one: "Name", line: it => oneLine(it) },
  { label: "Names and prices", one: "Name and price", priced: true, line: it => `${oneLine(it)} — ${money(it.price)}` },
  { label: "Names, shops and prices", one: "Name, shop and price", priced: true, line: it => `${oneLine(it)} — ${money(it.price)} (${it.shop_name})` },
  { label: "Names, shops, prices and links", one: "Name, shop, price and link", priced: true, block: true,
    line: it => `${oneLine(it)}\n${money(it.price)} · ${it.shop_name}\n${it.url}` },
];

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Couldn't copy");
  }
}

export function copyText(items, format) {
  let text = items.map(format.line).join(format.block ? "\n\n" : "\n");
  if (format.priced && items.length > 1) {
    text += `${format.block ? "\n\n" : "\n"}Total: ${money(items.reduce((sum, it) => sum + it.price, 0))}`;
  }
  return text;
}

// a copy icon that opens the format choices; with an id it copies that one item, otherwise the whole list
export function copyMenu(title, id) {
  const item = id == null ? "" : ` data-item="${esc(id)}"`;
  return `<details class="menu${id == null ? "" : " right"}">
    <summary class="icon-btn" title="${title}" aria-label="${title}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </summary>
    <div class="menu-list" role="menu">
      <div class="menu-title">${id == null ? "Copy all" : "Copy"}</div>
      ${COPY_FORMATS.map((f, i) => `<button type="button" role="menuitem" data-copy="${i}"${item}>${id == null ? f.label : f.one}</button>`).join("")}
    </div>
  </details>`;
}

// close an open menu when tapping anywhere else
document.addEventListener("click", e => {
  document.querySelectorAll("details.menu[open]").forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

// in an open menu: Escape closes it, the arrow keys move between its items
document.addEventListener("keydown", e => {
  const menu = e.target.closest?.("details.menu[open]");
  if (!menu) return;
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  if (e.key === "Escape") {
    e.preventDefault();
    menu.open = false;
    menu.querySelector("summary").focus();
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length : i) - 1;
    items[next]?.focus();
  }
});

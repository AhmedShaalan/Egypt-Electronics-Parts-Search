// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A line's products in a dropdown with a filter: close matches first, then the others, each
// cheapest first for the quantity. The filter box is a combobox: the arrow keys move through
// the products, Enter picks one, Escape closes.

import { lineCost, isClose } from "../search.js";
import { esc, money, thumb, priceDetail } from "./common.js";

let picker = null; // the open one: { el, trigger, order, active }

// the list was redrawn, which removed the open picker with it
export const forgetPicker = () => { picker = null; };
export const pickerOpenFor = trigger => picker?.trigger === trigger;

export function closePicker(refocus) {
  if (!picker) return;
  const { el, trigger } = picker;
  picker = null;
  el.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (refocus) trigger.focus();
}

// `picked` and `cheapest` are indexes into line.candidates; `onChoose(j)` gets the one chosen
export function openPicker(trigger, line, { picked, cheapest, onChoose }) {
  closePicker();
  const el = document.createElement("div");
  el.className = "picker";
  el.innerHTML = `
    <input type="search" class="picker-search" placeholder="Filter by name or shop" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"
      role="combobox" aria-expanded="true" aria-controls="picker-list" aria-autocomplete="list" aria-label="Filter the products for ${esc(line.query)}">
    <div class="picker-list" id="picker-list" role="listbox" aria-label="Products for ${esc(line.query)}"></div>`;
  trigger.after(el);
  trigger.setAttribute("aria-expanded", "true");
  const input = el.querySelector("input");
  const list = el.querySelector(".picker-list");
  picker = { el, trigger, order: [], active: 0 };

  const option = (c, j) => `
    <div class="opt" role="option" id="opt-${j}" data-j="${j}" aria-selected="${j === picked}">
      ${thumb(c)}
      <div class="opt-main">
        <div class="opt-name">${esc(c.name)}</div>
        <div class="opt-meta">${esc(c.shop_name)} · ${priceDetail(line, c)}${c.old_price ? ' · <span class="badge sale">Sale</span>' : ""}${j === cheapest ? ' · <span class="badge good">Cheapest</span>' : ""}</div>
      </div>
      <div class="opt-cost"><b>${money(lineCost(line, c))}</b>${j === picked ? '<span class="opt-check">✓ Picked</span>' : ""}</div>
    </div>`;
  const setActive = (n) => {
    if (!picker.order.length) return;
    picker.active = Math.max(0, Math.min(n, picker.order.length - 1));
    list.querySelectorAll(".opt.active").forEach(o => o.classList.remove("active"));
    const o = list.querySelector(`#opt-${picker.order[picker.active]}`);
    o.classList.add("active");
    o.scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", o.id);
  };
  const draw = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const byCost = (a, b) => lineCost(line, a.c) - lineCost(line, b.c);
    const shown = line.candidates.map((c, j) => ({ c, j }))
      .filter(({ c }) => words.every(w => `${c.name} ${c.shop_name}`.toLowerCase().includes(w)));
    const close = shown.filter(o => isClose(line, o.c)).sort(byCost);
    const other = shown.filter(o => !isClose(line, o.c)).sort(byCost);
    picker.order = [...close, ...other].map(o => o.j);
    const group = (title, opts) => opts.length ? `<div class="opt-group" role="presentation">${title} · ${opts.length}</div>${opts.map(o => option(o.c, o.j)).join("")}` : "";
    list.innerHTML = shown.length
      ? group("Close matches", close) + group(close.length ? "Other results" : "Results", other)
      : `<div class="picker-empty">No products match “${esc(input.value)}”.</div>`;
    input.removeAttribute("aria-activedescendant");
    const current = picker.order.indexOf(picked);
    setActive(current >= 0 ? current : 0);
  };
  const choose = (j) => {
    closePicker();
    onChoose(j);
  };

  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    const page = 6;
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (e.key in moves) { e.preventDefault(); setActive(picker.active + moves[e.key]); }
    else if (e.key === "Enter") { e.preventDefault(); if (picker.order.length) choose(picker.order[picker.active]); }
    else if (e.key === "Escape") { e.preventDefault(); closePicker(true); }
    else if (e.key === "Tab") closePicker();
  });
  list.addEventListener("pointermove", (e) => {
    const o = e.target.closest(".opt");
    if (o) setActive(picker.order.indexOf(+o.dataset.j));
  });
  list.addEventListener("click", (e) => {
    const o = e.target.closest(".opt");
    if (o) choose(+o.dataset.j);
  });
  draw();
  input.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest" });
}

// a click anywhere else closes the picker
document.addEventListener("pointerdown", (e) => {
  if (picker && !picker.el.contains(e.target) && !picker.trigger.contains(e.target)) closePicker();
});

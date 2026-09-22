// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Small helpers every part of the page uses.

import { packsNeeded } from "../search.js";

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = n => Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " EGP";
// links and images come from the shops' data, so only web addresses get through (no javascript:)
export const safeUrl = u => /^https?:\/\//i.test(String(u ?? "")) ? u : "#";
// read out by screen readers when results arrive
export const announce = msg => { $("#live").textContent = msg; };

// a short message; `action` ({ label, run }) adds a button to it, such as Undo
export function toast(msg, action) {
  const t = $("#toast");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.onclick = () => { t.classList.remove("show"); action.run(); };
    t.append(" ", b);
  }
  t.classList.toggle("has-action", !!action);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2200);
}

// a product's key, the same in every shop's results
export { productKey as key } from "../list-model.js";

// what the shop's cart insists on: "min. 10", "in 5s" or "min. 10, in 5s"; "" for none
export function buyRule(c) {
  const { minimum = 1, multiple_of = 1 } = c.cart_rules || {};
  return [minimum > 1 && `min. ${minimum}`, multiple_of > 1 && `in ${multiple_of}s`].filter(Boolean).join(", ");
}

// "4 EGP each", for a pack "2 packs of 10 at 5 EGP", and with a minimum "10 at 2 EGP · min. 10"
export function priceDetail(line, c) {
  const packs = packsNeeded(line, c);
  const rule = buyRule(c);
  if (c.pack > 1) return `${packs} pack${packs === 1 ? "" : "s"} of ${c.pack} at ${money(c.price)}${rule ? ` · ${rule}` : ""}`;
  return rule ? `${packs} at ${money(c.price)} · ${rule}` : `${money(c.price)} each`;
}

// a click on a modal dialog's dimmed backdrop, not in its padding
export function onBackdrop(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
}

// on a box that isn't a login or an address: password managers and autofill leave it alone
export const NO_AUTOFILL = { autocomplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true, "data-form-type": "other" };

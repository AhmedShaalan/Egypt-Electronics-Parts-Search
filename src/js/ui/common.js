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
export const key = p => p.shop + "|" + p.ref;

// "4 EGP each", or for a pack "2 packs of 10 at 5 EGP"
export function priceDetail(line, c) {
  const packs = packsNeeded(line, c);
  return c.pack > 1 ? `${packs} pack${packs === 1 ? "" : "s"} of ${c.pack} at ${money(c.price)}` : `${money(c.price)} each`;
}

// a click on a modal dialog's dimmed backdrop, not in its padding
export function onBackdrop(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
}

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

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

// a product's key, the same in every shop's results
export const key = p => p.shop + "|" + p.ref;

export function thumb(p) {
  return p.image && safeUrl(p.image) !== "#"
    ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb'}))">`
    : `<div class="thumb"></div>`;
}

export function packNote(p) {
  return p.pack > 1 ? `<span class="per">${money(p.unit_price)}/pc</span>` : "";
}

// "4 EGP each", or for a pack "2 packs of 10 at 5 EGP"
export function priceDetail(line, c) {
  const packs = packsNeeded(line, c);
  return c.pack > 1 ? `${packs} pack${packs === 1 ? "" : "s"} of ${c.pack} at ${money(c.price)}` : `${money(c.price)} each`;
}

// loading line with a progress bar underneath; `text` is already escaped
export function loadingHtml(text, total, unit, skippable = false) {
  return `<div class="loading">${text}
    <div class="progress"><div class="bar"><i></i></div><div class="progress-label">0 of ${total} ${unit}</div></div>
    ${skippable ? `<button type="button" class="btn skip" hidden>Show results so far</button>` : ""}
  </div>`;
}

export function setProgress(el, done, total, unit) {
  // a newer search replaces the loading line, so a stale one must not write into it
  if (!el.isConnected) return;
  el.querySelector(".bar i").style.width = `${Math.round((done / total) * 100)}%`;
  el.querySelector(".progress-label").textContent = `${done} of ${total} ${unit}`;
  const skip = el.parentElement.querySelector(".skip");
  if (skip && done > 0) skip.hidden = false;
}

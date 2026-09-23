// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Which shops a search asks: the pill at the end of the search box. It opens a panel with a box
// to find a shop by name, since 17 names are a lot to read through, then every shop that matches.
// The search box is in the page rather than in a tab, so this is plain DOM like the rest of it.

import { SHOPS, SHOPS_BY_KEY } from "../../shops.js";
import { $ } from "../common.js";

const ALL = { key: "", name: "All shops" };
const byName = [...SHOPS].sort((a, b) => a.name.localeCompare(b.name));
let chosen = "";       // the shop's key, or "" for every shop
let picked = null;     // what runs when another is chosen

// the shop the search box is set to, or "" for every shop
export const pickedShop = () => chosen;

// sets the pill without searching: a shared ?shop= link, or a search of every shop
export function pickShop(key) {
  chosen = SHOPS_BY_KEY[key] ? key : "";
  const btn = $("#q-shop-btn");
  btn.textContent = chosen ? SHOPS_BY_KEY[chosen].name : ALL.name;
  btn.title = chosen ? `Searching ${SHOPS_BY_KEY[chosen].name} only` : "Searching every shop";
  btn.classList.toggle("on", !!chosen);
}

const options = () => [...$("#q-shop-list").querySelectorAll("[data-key]")];

// the shops whose name has what was typed in it, the one in use marked
function draw(find) {
  const list = $("#q-shop-list");
  const want = find.trim().toLowerCase();
  const shown = [ALL, ...byName].filter(s => !want || s.name.toLowerCase().includes(want));
  list.replaceChildren(...shown.map(s => {
    const li = document.createElement("li");
    li.dataset.key = s.key;
    li.textContent = s.name;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(s.key === chosen));
    li.tabIndex = -1;
    return li;
  }));
  if (!shown.length) {
    const none = document.createElement("li");
    none.className = "s-shop-none";
    none.textContent = "No shop with that name";
    list.append(none);
  }
}

function open() {
  const menu = $("#q-shop-menu");
  if (!menu.hidden) return;
  menu.hidden = false;
  $("#q-shop-btn").setAttribute("aria-expanded", "true");
  $("#q-shop-find").value = "";
  draw("");
  $("#q-shop-find").focus();
}

function close(back) {
  const menu = $("#q-shop-menu");
  if (menu.hidden) return;
  menu.hidden = true;
  $("#q-shop-btn").setAttribute("aria-expanded", "false");
  if (back) $("#q-shop-btn").focus();
}

// moves through the shops on screen; `from` is where the keys were pressed
function move(from, by) {
  const all = options();
  if (!all.length) return;
  const at = all.indexOf(from);
  const next = by === Infinity ? all.length - 1 : by === -Infinity ? 0 : (at + by + all.length) % all.length;
  all[at < 0 && by < 0 ? all.length - 1 : at < 0 ? 0 : next].focus();
}

function choose(key) {
  const before = chosen;
  pickShop(key);
  close(true);
  if (chosen !== before) picked?.(chosen);
}

// `onPick` runs with the shop's key, or "", once another is chosen
export function setUpShopPick(onPick) {
  picked = onPick;
  pickShop("");
  const btn = $("#q-shop-btn");
  const find = $("#q-shop-find");
  const list = $("#q-shop-list");
  btn.addEventListener("click", () => ($("#q-shop-menu").hidden ? open() : close(true)));
  find.addEventListener("input", () => draw(find.value));
  find.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(null, 1); }
    else if (e.key === "Enter") { e.preventDefault(); const first = options()[0]; if (first) choose(first.dataset.key); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
  });
  list.addEventListener("click", e => {
    const li = e.target.closest("[data-key]");
    if (li) choose(li.dataset.key);
  });
  list.addEventListener("keydown", e => {
    const li = e.target.closest("[data-key]");
    if (!li) return;
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };
    if (e.key in keys) { e.preventDefault(); move(li, keys[e.key]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(li.dataset.key); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key.length === 1) { find.focus(); }
  });
  // a click anywhere else, or the tab being left, closes it
  document.addEventListener("pointerdown", e => { if (!e.target.closest("#q-shop")) close(false); });
  document.addEventListener("focusin", e => { if (!e.target.closest("#q-shop")) close(false); });
}

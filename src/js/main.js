// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The page: its tabs, and what runs once it has loaded. Each tab's code is in ui/.

import { warmUp } from "./search.js";
import { $ } from "./ui/common.js";
import { copy } from "./ui/copy.js";
import { searchTabShown } from "./ui/search-tab.jsx";
import { listTabShown } from "./ui/list-tab.jsx";
import { reloadSaved } from "./ui/saved.js";
import { loadSaved } from "./ui/saved-tab.jsx";
import { renderShops } from "./ui/shops-tab.jsx";

$("#theme-toggle").addEventListener("click", () => window.toggleTheme());

// the header's height, for what sticks under it (the search bar, the parts list's order); it wraps onto two lines on phones
const header = $("header");
new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`)).observe(header);

// shows once the page has scrolled past the first screen
const toTop = $("#to-top");
const updateToTop = () => toTop.classList.toggle("show", scrollY > innerHeight);
addEventListener("scroll", updateToTop, { passive: true });
toTop.addEventListener("click", () => {
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
});

/* ---------- tabs ---------- */
const TABS = ["search", "list", "saved", "shops", "ai"];

function showTab() {
  const hash = location.hash.slice(1);
  // a link to a part of a page (#about) opens the search tab, where that part is
  const tab = TABS.includes(hash) ? hash : "search";
  if (hash && tab !== hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
  document.querySelectorAll("main section").forEach(s => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "saved") loadSaved();
  if (tab === "list") listTabShown();
  searchTabShown(tab === "search");
}
window.addEventListener("hashchange", showTab);

// the AI tab's setup commands
document.querySelectorAll(".copy-code").forEach(b => b.addEventListener("click", () => copy(b.parentElement.querySelector("pre").innerText)));

/* ---------- start ---------- */
reloadSaved();
renderShops($("#shops-out"));
showTab();
// the catalogs searched in the browser are a few MB, so they load once a search is being typed
for (const el of [$("#q"), $("#list-text")]) el.addEventListener("input", warmUp, { once: true });

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The page: its tabs, and what runs once it has loaded. Each tab's code is in its own folder in
// ui/: search/, list/, saved/, shops/, ai/ and about/.

import { h, render } from "preact";
import { warmUp } from "./search.js";
import { $ } from "./ui/common.js";
import { SearchApp, searchTabShown, setUpSearchBox } from "./ui/search/index.js";
import { ListApp, LeaveDialog, listTabShown, hasUnsaved, askToLeave } from "./ui/list/index.js";
import { SavedApp } from "./ui/saved/index.js";
import { reloadSaved } from "./ui/saved.js";
import { ShopsApp } from "./ui/shops/index.js";
import { AiApp } from "./ui/ai/index.js";
import { AboutApp } from "./ui/about/index.js";

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
const TABS = ["search", "list", "saved", "shops", "ai", "about"];
let shownTab = null;

// the tab an address opens: a link to a part of a tab (#ai-setup) opens that tab; anything else,
// or none, the search tab
const tabOf = hash => (TABS.includes(hash) ? hash : document.getElementById(hash)?.closest("main > section")?.id.slice("tab-".length) ?? "search");

// leaving the Parts list with unsaved changes asks first. True when it's asking: `to` is the
// address to go to once the list says it may be left.
let mayLeaveList = false;
function listHolds(to) {
  if (shownTab !== "list" || mayLeaveList || tabOf(to.slice(1)) === "list" || !hasUnsaved()) return false;
  askToLeave(() => { mayLeaveList = true; location.hash = to; });
  return true;
}

function showTab() {
  const hash = location.hash.slice(1);
  const part = hash && !TABS.includes(hash) ? document.getElementById(hash) : null;
  const tab = tabOf(hash);
  // gone back or sent to another tab from the list: it stays on the list while asking. The list
  // goes back on top of the entry Back went to, so that entry is still there after Stay.
  if (listHolds(location.hash || "#search")) {
    history.pushState(null, "", "#list");
    return;
  }
  mayLeaveList = false;
  document.querySelectorAll("header nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.querySelectorAll("main > section").forEach(s => s.classList.toggle("active", s.id === "tab-" + tab));
  // within the tab being read (its contents, "What can I ask?") it glides there, unless motion is reduced
  const smooth = tab === shownTab && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (part) requestAnimationFrame(() => part.scrollIntoView({ behavior: smooth ? "smooth" : "auto" }));
  shownTab = tab;
  // what's saved may have changed on another tab of the browser
  if (tab === "saved") reloadSaved();
  if (tab === "list") listTabShown();
  searchTabShown(tab === "search");
}
window.addEventListener("hashchange", showTab);

// a link to another tab asks first when the Parts list has unsaved changes, before the address changes
document.addEventListener("click", e => {
  const a = e.target.closest?.('a[href^="#"]');
  if (a && !(e.button || e.metaKey || e.ctrlKey || e.shiftKey) && listHolds(a.getAttribute("href"))) e.preventDefault();
});

// closing or reloading the page does too, with the browser's own question: it allows no other
addEventListener("beforeunload", e => {
  if (shownTab !== "list" || !hasUnsaved()) return;
  e.preventDefault();
  e.returnValue = ""; // for browsers that still ask for it
});

// a link to a part of the tab being read glides there; the browser's own jump would be instant
document.addEventListener("click", e => {
  const a = e.target.closest?.('a[href^="#"]');
  const part = a && document.getElementById(a.getAttribute("href").slice(1));
  if (!part || TABS.includes(part.id) || !part.closest("main > section.active") || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  history.pushState(null, "", a.getAttribute("href"));
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  part.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
});

/* ---------- start ---------- */
reloadSaved();
setUpSearchBox();
render(h(SearchApp), $("#search-app"));
render(h(ListApp), $("#list-app"));
render(h(SavedApp), $("#saved-app"));
render(h(ShopsApp), $("#shops-app"));
render(h(AiApp), $("#ai-app"));
render(h(AboutApp), $("#about-app"));
render(h(LeaveDialog), $("#leave-app"));
showTab();
// the catalogs searched in the browser are a few MB, so they load once a search is being typed
for (const el of [$("#q"), $("#list-text")]) el.addEventListener("input", warmUp, { once: true });

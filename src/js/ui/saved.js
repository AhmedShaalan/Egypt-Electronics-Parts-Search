// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// What's saved in this browser, as the page last read it: starred items and parts lists. The
// Saved tab (saved-tab.jsx) draws it; the star on search results and the tab's count use it too.

import { getSaved, saveItem as storeItem, unsaveItem as storeUnsave } from "../search.js";
import { $, toast, key } from "./common.js";

let saved = { items: [], lists: [] };
let savedKeys = new Set();
const listeners = new Set();

export const currentSaved = () => saved;
export function onSavedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// the stored items and lists, read again after something changed them
export function reloadSaved() {
  saved = getSaved();
  savedKeys = new Set(saved.items.map(key));
  updateSavedCount();
  for (const f of listeners) f();
}

export const isSaved = p => savedKeys.has(key(p));

// the star toggles: starred items are saved, tapping a filled star removes them again
export function toggleSave(p) {
  try {
    const on = !savedKeys.has(key(p));
    if (on) storeItem(p); else storeUnsave(p);
    reloadSaved();
    toast(on ? "Saved. Its price is checked again when you update prices in Saved." : "Removed from saved");
  } catch (e) { toast(e.message); }
}

// the tab counts saved items and saved parts lists
export function updateSavedCount() {
  $("#saved-count").textContent = saved.items.length + saved.lists.length;
}

export const partCount = l => l.text.split("\n").filter(x => x.trim()).length;

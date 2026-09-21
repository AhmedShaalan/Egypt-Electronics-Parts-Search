// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// What the tabs remember in this browser: settings and work in progress. Storage can be blocked
// (private mode, full), so reading falls back to a default and writing keeps it for this visit only.

const PREFIX = "egypt-parts-search:";

export function loadJSON(name, fallback) {
  try { return JSON.parse(localStorage.getItem(PREFIX + name)) ?? fallback; } catch { return fallback; }
}
export function saveJSON(name, value) {
  try { localStorage.setItem(PREFIX + name, JSON.stringify(value)); } catch { /* kept for this visit only */ }
}

// a plain string, for values stored before they were JSON
export function loadText(name) {
  try { return localStorage.getItem(PREFIX + name); } catch { return null; }
}
export function saveText(name, value) {
  try { localStorage.setItem(PREFIX + name, value); } catch { /* kept for this visit only */ }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Numbers, counts and times as the page writes them.

import { money } from "./common.js";

// "1 part", "3 parts"; `many` for words that don't just take an s
export const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

// "2 colours", "3 options": the choices a product is sold in, picked on its shop's page; "" for none
export const choices = c => (c.options ? plural(c.options.choices.length, c.options.what === "colour" ? "colour" : "option") : "");

// a price without its currency, where EGP is said once nearby
export const num = n => money(n).replace(" EGP", "");

// how long ago: "just now", "5 minutes ago", "yesterday", "last week", or the date
export function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${plural(mins, "minute")} ago`;
  if (mins < 60 * 24) return `${plural(Math.round(mins / 60), "hour")} ago`;
  const days = Math.round(mins / (60 * 24));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

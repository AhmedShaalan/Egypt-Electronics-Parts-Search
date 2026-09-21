// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Copying results and saved items to the clipboard, and the small menus that offer the formats.

import { money, toast } from "./common.js";

// what the copy menu on the saved tab can put on the clipboard. Short formats are one item per
// line; the one with links gives each item its own block. Lists with prices end with the total.
const oneLine = it => it.name.replace(/\s+/g, " ").trim();
export const COPY_FORMATS = [
  { label: "Names", one: "Name", line: it => oneLine(it) },
  { label: "Names and prices", one: "Name and price", priced: true, line: it => `${oneLine(it)} — ${money(it.price)}` },
  { label: "Names, shops and prices", one: "Name, shop and price", priced: true, line: it => `${oneLine(it)} — ${money(it.price)} (${it.shop_name})` },
  { label: "Names, shops, prices and links", one: "Name, shop, price and link", priced: true, block: true,
    line: it => `${oneLine(it)}\n${money(it.price)} · ${it.shop_name}\n${it.url}` },
];

// says `done` once it's on the clipboard; true if it got there
export async function copy(text, done = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return true;
  } catch {
    toast("Couldn't copy");
    return false;
  }
}

export function copyText(items, format) {
  let text = items.map(format.line).join(format.block ? "\n\n" : "\n");
  if (format.priced && items.length > 1) {
    text += `${format.block ? "\n\n" : "\n"}Total: ${money(items.reduce((sum, it) => sum + it.price, 0))}`;
  }
  return text;
}

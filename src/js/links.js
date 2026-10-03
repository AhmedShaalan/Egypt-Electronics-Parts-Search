// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Product links pasted in: which shop's product a link is to, and what to search for to find the
// same part at the other shops.

import { packSize } from "./matching.js";
import { SHOPS, LinkError } from "./shops.js";

export { LinkError };

const URL_IN = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

// the link in a line of text, and the rest of the line: "https://…/lm7805 x3" gives the link and
// "x3"; null when there's none
export function linkIn(line) {
  const m = String(line).match(URL_IN);
  if (!m) return null;
  const href = m[0].replace(/[.,;:!?)]+$/, ""); // the end of a sentence isn't part of it
  let url;
  try {
    url = new URL(/^www\./i.test(href) ? `https://${href}` : href);
  } catch {
    return null;
  }
  return { url, rest: `${line.slice(0, m.index)} ${line.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim() };
}

// text that's a link and nothing else
export const isLink = (text) => linkIn(text)?.rest === "";

export const shopOf = (url) => SHOPS.find((s) => s.owns(url)) ?? null;

// The product a link (a URL) is to, as the search gives products, with its pack size; it may be
// out of stock. Throws a LinkError saying why when there's none.
export async function productAt(url, signal) {
  const shop = shopOf(url);
  if (!shop) throw new LinkError("That link isn't to one of the shops searched here");
  let p;
  try {
    p = await shop.fromUrl(url, signal);
  } catch (e) {
    if (e instanceof LinkError) throw e;
    throw new LinkError(`${shop.name} didn't answer. Try again`);
  }
  if (!p) throw new LinkError(`${shop.name} has no product at that link`);
  if (!(p.price > 0)) throw new LinkError(`${shop.name} shows no price for that product`);
  const pack = packSize(p.name);
  return { ...p, pack, unit_price: Math.round((p.price / pack) * 1000) / 1000, shop_name: shop.name };
}

// ---------- a product's name as a search ----------

// Shops name one part many ways, and a whole name finds few of the others ("L7805CV Linear
// Voltage Regulator 5V/1A out" misses "LM7805 Regulator"). Its part number alone finds nearly
// all of them; a name without one is searched by what it is, in two words, and its value.

const VALUE = /^\d+(?:\.\d+)?(?:v|mv|vdc|vac|a|ma|mah|ah|w|kw|ohm|ohms|kohm|k|m|r|uf|nf|pf|uh|mh|mm|cm|hz|khz|mhz|pin|pins|pcs|pc|ch|channel|bit|rpm|db|g|kg|nm)$/i;
// a component's value: 10k, 4.7kohm, 100uf
const PART_VALUE = /^\d+(?:\.\d+)?(?:k|m)?(?:ohms?|k|m|r|uf|nf|pf|uh|mh)$/i;
const UNIT_WORD = /^(?:v|mv|a|ma|mah|w|watts?|ohms?|k|kohm|uf|nf|pf|mm|cm|pcs|pieces|pins?|channels?|ch|rpm|bits?|inch|awg|x|degrees?)$/i;
// what has letters and digits without being the part: revisions, packages, USB chips
const NOT_PART = /^(?:r\d|rev\d|v\d(?:\.\d)?|to\d+|dip\d*|sop\d*|soic\d*|sot\d*|sod\d*|qfn\d*|tqfp\d*|0402|0603|0805|1206|2512|ch340\w*|cp210\d|ch9102\w*|usb\d?|type-?c|wifi\d*|bt\d|ble\d|2\.4g(?:hz)?|\d+x\d+mm)$/i;
const REVISION = /^(?:r|rev)\d$/i;
const FILLER = new Set(["original", "genuine", "new", "high", "quality", "best", "china", "chinese", "compatible", "the", "a", "an", "and", "&"]);
// boards named after their maker, whose chip's number is in the name as well: an "Arduino Uno R3
// ATmega328p" is searched as an Arduino Uno, not as the chip
const BOARDS = /\b(?:arduino\s+(?:uno|nano|mega|leonardo|due|micro|pro\s+mini)|raspberry\s+pi\s+(?:\d\w*|zero\s*\w*|pico\s*\w*))/i;

// the name without its notes: the shop's code in front, what's in brackets, and what follows a
// dash, a bar, a comma, "with" or "for". An option's value, after "—", is kept.
function core(name) {
  return name
    .replace(/^\s*\[[^\]]*\]\s*/, "")
    .replace(/[Ωω]/g, "ohm")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/\s+[-–|]\s+|,|\s+(?:with|for|without|includ\w*|exclud\w*)\s+/i)[0]
    .replace(/\s+—\s+/g, " ")
    // a value written apart from its unit: "360 OHM" -> "360OHM"
    .replace(/(\d)\s+(ohms?|k|kohm|uf|nf|pf|v|a|ma|w)\b/gi, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

// A part number in a word: letters and digits together (LM7805, ESP32-CAM, HC-SR04, MPU-6050),
// less any of its segments that are values or packages (5V-7805 -> 7805, ESP32-CAM-CH340 ->
// ESP32-CAM). Null for none.
// A lone letter after a dash is left off too: ESP32-S is searched as ESP32.
function partNumber(word) {
  const segs = word.replace(/^[^0-9a-z]+|[^0-9a-z]+$/gi, "").split(/[-_/]/).filter((s) => s && !VALUE.test(s) && !NOT_PART.test(s))
    .filter((s, i) => i === 0 || s.length > 1);
  const w = segs.join("-");
  const mixed = segs.some((s) => /[a-z]/i.test(s) && /\d/.test(s)) || /^[a-z]{2,}-\d{2,}/i.test(w);
  return mixed && w.replace(/[^0-9a-z]/gi, "").length >= 4 && !NOT_PART.test(w) ? w : null;
}

// what to search for to find a product at the other shops, from its name
export function partQuery(name) {
  const text = core(name);
  const words = text.split(" ").filter((w) => /[0-9a-z]/i.test(w));
  const at = words.findIndex(partNumber);
  const board = text.match(BOARDS);
  if (board && (at < 0 || board.index < text.indexOf(words[at]))) return board[0].replace(/\s+/g, " ");
  if (at >= 0) return partNumber(words[at]);
  // one in brackets: "Temperature Humidity Sensor Module (DHT11)"
  const noted = (name.match(/\(([^)]*)\)|\[([^\]]*)\]/g) || []).slice(name.trim().startsWith("[") ? 1 : 0)
    .flatMap((n) => n.slice(1, -1).split(/\s+/)).map(partNumber).find(Boolean);
  if (noted) return noted;
  // a model number on its own: 7805, 555, 18650, also after a value (5V-7805); not a value
  // written apart from its unit
  const number = (w) => { const segs = w.split(/[-_/]/).filter((x) => x && !VALUE.test(x)); return segs.length === 1 && /^\d{3,}$/.test(segs[0]) && !NOT_PART.test(segs[0]) ? segs[0] : null; };
  const bare = words.find((w, i) => number(w) && !UNIT_WORD.test(words[i + 1] || ""));
  if (bare) return number(bare);
  const kept = words.filter((w) => !REVISION.test(w) && !FILLER.has(w.toLowerCase()));
  const lead = kept.filter((w) => !/\d/.test(w) && !UNIT_WORD.test(w)).slice(0, 2);
  const value = kept.find((w) => PART_VALUE.test(w));
  return [...lead, ...(value ? [value] : [])].join(" ") || text || name.trim();
}

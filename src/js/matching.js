// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Scoring how well a product name matches a search query.
//
// Shops name the same part differently ("LM7805", "L7805CV", "7805 Regulator"),
// so matching works on normalized tokens plus the digit core of part numbers.

export const STRONG = 70; // counts as a real match
export const WEAK = 45; // shown only behind "weaker matches"

const STOPWORDS = new Set(["the", "for", "with", "and", "of", "pcs", "pc", "piece", "pieces", "a"]);
const UNIT_FIXES = [["Ω", "ohm"], ["ω", "ohm"], ["µ", "u"], ["μ", "u"], ["×", "x"]];
// common names shops use interchangeably
const ALIASES = { "16x2": "1602", "1602": "16x2", "20x4": "2004", "2004": "20x4", "12864": "128x64" };

// makers' names: many shops leave them out, so a name without one isn't a worse match
// (words that also mean something else, like "analog" or "finder", aren't listed)
const BRANDS = new Set([
  "omron", "songle", "hongfa", "schneider", "texas", "instruments", "stmicroelectronics", "nxp", "microchip",
  "atmel", "infineon", "vishay", "onsemi", "fairchild", "toshiba", "panasonic", "murata", "espressif", "bosch",
  "maxim", "renesas", "rohm", "nichicon", "rubycon",
]);

const ACCESSORY_WORDS = new Set(["for", "compatible"]);
const ACCESSORY_NAMES = new Set([
  "adapter", "breakout", "base", "baseboard", "shield", "pcb", "cable", "case", "enclosure", "shell",
  "holder", "socket", "programmer", "expansion", "cover", "bracket", "mount", "connector", "download",
  "protective", "acrylic", "sticker", "stand", "jumper", "wire", "wires",
]);
// accessory words that also appear glued to the next word ("Casefor Arduino")
const ACCESSORY_PREFIXES = ["case", "cable", "shield", "adapter", "holder", "enclosure", "programmer"];

const SPLIT = /[^0-9a-z\u0600-\u06ff.]+/;
const isDigit = (c) => /^\p{Nd}+$/u.test(c);
const hasDigit = (s) => /\p{Nd}/u.test(s);
const hasLetter = (s) => /[a-z]/.test(s);
const stripDots = (s) => s.replace(/^\.+|\.+$/g, "");
const longestDigitRun = (s) => (s.match(/\p{Nd}+/gu) || []).reduce((a, b) => (b.length > a.length ? b : a), "");

// "12 V", "250 mA", "10 k" -> "12v", "250ma", "10k", the way shops write values
const UNIT_GAP = /(\d)\s+(v|mv|a|ma|mah|ah|w|kw|ohm|kohm|k|uf|nf|pf|mm|hz|khz|mhz)(?![0-9a-z])/g;
// "16 x 2 LCD" -> "16x2 lcd"
const DIMENSIONS = /(\d)\s+x\s+(\d)/g;
// "220.0 ohm" -> "220 ohm"
const ZERO_DECIMALS = /(\d)\.0+(?![0-9])/g;
// "250mA" -> "0.25a", so it matches the shops that write 0.25A
const MILLIAMPS = /(?<![0-9a-z.])(\d+(?:\.\d+)?)ma(?![0-9a-z])/g;
// a value with its unit: 250ma, 12v, 10k, 100nf
const VALUE = /^\d+(?:\.\d+)?(?:v|mv|vdc|vac|a|ma|mah|ah|w|kw|ohm|kohm|k|uf|nf|pf|mm|hz|khz|mhz)$/;
// "Mini-360", "LM 7805" -> "mini360", "lm7805": a name and its model number written apart
const NAME_NUMBER_GAP = /(^|[^0-9a-z])([a-z]{2,})[-\s](\d{3,})(?![0-9a-z])/g;

function clean(s) {
  s = s.toLowerCase();
  for (const [a, b] of UNIT_FIXES) s = s.replaceAll(a, b);
  return s.replace(DIMENSIONS, "$1x$2").replace(ZERO_DECIMALS, "$1").replace(UNIT_GAP, "$1$2").replace(MILLIAMPS, (_, n) => `${Number(n) / 1000}a`);
}

export function tokens(s) {
  return clean(s).split(SPLIT).map(stripDots).filter((t) => t && !STOPWORDS.has(t));
}

// The name with its spaces and symbols taken out, keeping decimal points (4.7k is not 47k).
// `starts` holds where each word began, so a word isn't found inside another: male ≠ female.
function compact(s) {
  let text = "";
  const starts = new Set();
  for (const w of clean(s).split(/[^0-9a-z\u0600-\u06ff.]+/)) {
    const part = w.replace(/\.(?!\d)|(?<!\d)\./g, "");
    if (!part) continue;
    starts.add(text.length);
    text += part;
  }
  return { text, starts };
}

const letterOnly = (t) => !hasDigit(t);

// Substring match that won't let 10k match 910k, 7805 match 17805, 7k match 4.7k,
// or (for words without digits) male match female.
function foundIn(t, text, starts) {
  let from = 0;
  for (;;) {
    const i = text.indexOf(t, from);
    if (i < 0) return false;
    from = i + 1;
    const end = i + t.length;
    if (isDigit(t[0]) && i && (isDigit(text[i - 1]) || (text[i - 1] === "." && isDigit(text[i - 2] || "")))) continue;
    if (isDigit(t[t.length - 1]) && (isDigit(text[end] || "") || (text[end] === "." && isDigit(text[end + 1] || "")))) continue;
    if (starts && letterOnly(t) && !starts.has(i)) continue;
    return true;
  }
}

function tokenWeight(t, nameTokens, nameCompact) {
  if (nameTokens.includes(t) || (ALIASES[t] && nameTokens.includes(ALIASES[t]))) return 1.0;
  for (const nt of nameTokens) {
    // plurals and suffixes: resistor/resistors, esp32/esp32s3, 10k/10kohm
    if (t.length >= 2 && (nt.startsWith(t) || (t.startsWith(nt) && t.length - nt.length <= 2 && nt.length >= 3))) {
      const next = nt.slice(t.length, t.length + 1);
      if (!(isDigit(t[t.length - 1]) && next && isDigit(next))) return 0.9;
    }
  }
  if (isDigit(t) && t.length >= 3 && nameTokens.some((nt) => foundIn(t, nt))) return 0.9; // 7805 ~ l7805cv
  // a part number's digits can stand for it, a value's can't: 250ma is not 250v
  if (hasLetter(t) && hasDigit(t) && !VALUE.test(t)) {
    const core = longestDigitRun(t);
    if (core.length >= 3 && nameTokens.some((nt) => foundIn(core, nt))) return 0.8; // lm7805 ~ l7805cv
  }
  if (t.length >= 3 && foundIn(compactText(t), nameCompact.text, nameCompact.starts)) return 0.6;
  return 0.0;
}

// What score() needs from a product name. Catalogs are scored against every search, so it's
// worked out once per name.
function memo(fn) {
  const cache = new Map();
  return (s) => {
    let v = cache.get(s);
    if (v === undefined) {
      if (cache.size > 50_000) cache.clear();
      cache.set(s, (v = fn(s)));
    }
    return v;
  };
}
const prepare = memo((name) => {
  const raw = clean(name).split(SPLIT).map(stripDots).filter(Boolean);
  return { nameTokens: tokens(name), nameCompact: compact(name), raw, rawCompact: raw.map(compact) };
});
const queryTokens = memo(tokens);
const compactText = memo((s) => compact(s).text);

export function score(query, name) {
  const qTokens = queryTokens(query);
  if (!qTokens.length) return 0;
  const { nameTokens, nameCompact, raw, rawCompact } = prepare(name);
  const weights = qTokens.map((t) => tokenWeight(t, nameTokens, nameCompact));
  // a maker's name the product doesn't mention is left out rather than counted as missing,
  // but only once a part number or value has matched: "Schneider contactor" still needs Schneider
  const numbered = qTokens.some((t, i) => weights[i] > 0 && hasDigit(t));
  const counted = qTokens.filter((t, i) => !numbered || weights[i] > 0 || !BRANDS.has(t)).length;
  let s = (100 * weights.reduce((a, b) => a + b, 0)) / counted;
  // part numbers and values (7805, 10k, 100nf) must match; the words around them may not
  if (qTokens.some((t, i) => weights[i] === 0 && hasDigit(t))) s = Math.min(s, WEAK - 5);
  // the query written as one word is in the name: "mini 360" ~ "Mini360"
  const cq = compactText(query);
  const bonusStarts = letterOnly(qTokens[0]) ? nameCompact.starts : null;
  if (cq.length >= 3 && foundIn(cq, nameCompact.text, bonusStarts)) s += 10;
  s = Math.min(s, 100);
  // what follows can only lower the score
  if (s < WEAK) return Math.max(0, Math.trunc(s));
  // "PCB for ESP32" is an accessory, not the ESP32 itself,
  // unless the search is for an accessory: "fuse holder" wants "Fuse Holder for T5x20"
  const accessory = (t) => ACCESSORY_NAMES.has(t) || ACCESSORY_PREFIXES.some((p) => t.startsWith(p));
  const inQuery = (t) => qTokens.some((q) => q.startsWith(t) || t.startsWith(q)); // wire ~ wires
  const matchedAt = raw
    .map((w, i) => (qTokens.some((t) => tokenWeight(t, [w], rawCompact[i]) >= 0.8) ? i : -1))
    .filter((i) => i >= 0);
  const lastMatch = matchedAt.length ? Math.max(...matchedAt) : 0;
  if (
    !qTokens.some(accessory) &&
    raw.slice(0, lastMatch).some((w) => ACCESSORY_WORDS.has(w) || (w.endsWith("for") && w.length > 3))
  ) {
    s -= 35;
  } else if (nameTokens.some((t) => accessory(t) && !inQuery(t))) {
    // boards, cables and cases that carry the part's name rank below the part
    s -= 30;
  }
  return Math.max(0, Math.trunc(s));
}

// Extra queries for shop search engines that only match literally: LM7805 -> 7805.
// They only widen what the shops return; score() still decides what matches.
export function searchVariants(query) {
  const q = query.toLowerCase();
  // written the way shops write it: "12 V 2 A" -> "12v 2a", "Mini-360" -> "mini360"
  const tidy = clean(q).replace(NAME_NUMBER_GAP, "$1$2$3");
  const variants = [tidy];
  // WooCommerce matches several words as one phrase, so "Mini360 buck converter" misses
  // "Mini360 DC-DC Buck Converter". The model number alone finds it; one with a segment
  // the shop doesn't write gets trimmed too (XKC-Y25-NPN -> XKC-Y25).
  const model = tidy
    .split(/\s+/)
    .map((w) => w.replace(/^[^0-9a-z]+|[^0-9a-z]+$/g, "")) // "(t5x20mm)" -> "t5x20mm"
    .filter((w) => hasLetter(w) && hasDigit(w) && w.length >= 4)
    // a part number or size before a value: t5x20mm, not 0.25a
    .sort((a, b) => VALUE.test(a) - VALUE.test(b) || b.length - a.length)[0];
  if (model) {
    if ((model.match(/-/g) || []).length >= 2) variants.push(model.slice(0, model.lastIndexOf("-")));
    variants.push(model);
  }
  // and the description without its extras: "12v 2a power supply with barrel jack"
  variants.push(tidy.split(/\s+(?:with|for)\s+/)[0]);
  for (const t of tokens(query)) {
    if (ALIASES[t]) {
      variants.push(q.replaceAll(t, ALIASES[t]));
      if (t.includes("x")) variants.push(q.replaceAll(t, t.replaceAll("x", "×")));
    }
    if (hasLetter(t) && hasDigit(t) && !VALUE.test(t)) {
      const core = longestDigitRun(t);
      // the whole word goes, with any suffix glued on by a dash: atmega328p-pu -> 328, not 328-pu
      if (core.length >= 3) variants.push(q.split(/\s+/).map((w) => (w.includes(t) ? core : w)).join(" "));
    }
  }
  return [...new Set(variants)].filter((v) => v && v !== q).slice(0, 3);
}

// How many pieces one listing sells: "(10pcs)", "Pack of 5", "20 Pieces".
// A kit's count is of different parts ("Resistor Kit 600pcs 30 values"), so a kit is one piece.
export function packSize(name) {
  const n = clean(name);
  if (/\b(?:kit|assortment|assorted)\b/.test(n)) return 1;
  const m = n.match(/(?:pack|set|bag)\s+of\s+(\d+)/) || n.match(/\b(\d+)\s*(?:pcs|pieces|pc)\b/);
  const size = m ? parseInt(m[1], 10) : 1;
  return size >= 1 && size <= 1000 ? size : 1;
}

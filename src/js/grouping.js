// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Grouping search results that are the same product at different shops.
//
// Shops name one part many ways ("L7805CV", "LM7805 Positive Voltage Regulator TO-220 5V"), so
// names are compared by the details that tell products apart: the package, the form (a module,
// a shield, a holder), the interface, values like 5V or 1/4W, the pack size, model codes (S3,
// 78M05, 30-pin) and a few words that mark a variant (CAM, Mini, OLED). A detail one name leaves
// out doesn't count against it, except the form, the interface, the pack size, model codes,
// variant words and SMD, which must be the same, and prices far apart keep offers apart. Anything unsure stays on its own: a wrong merge would
// hide a different part behind a cheaper price.

import { score, tokens } from "./matching.js";

const PACKAGES = [
  [/\bto[\s-]?220\b/, "TO-220"], [/\bto[\s-]?92\b/, "TO-92"], [/\bto[\s-]?3\b/, "TO-3"],
  [/\b(?:to[\s-]?252|d-?pak)\b/, "TO-252"], [/\b(?:to[\s-]?263|d2-?pak)\b/, "TO-263"],
  [/\b(?:smd|smt|chip resistor)\b/, "SMD"], [/\bdip[\s-]?\d*\b/, "DIP"], [/\b(?:sop|soic)[\s-]?\d*\b/, "SOP"],
  [/\bsot[\s-]?\d+\b/, "SOT"], [/\bthrough[\s-]?hole\b/, "through-hole"],
];
const FORMS = [
  [/\bmodules?\b/, "module"], [/\bshields?\b/, "shield"], [/\b(?:holders?|brackets?|mounts?|mounting|stand)\b/, "holder"],
  [/\b(?:case|enclosure|shell)\b/, "case"], [/\bcables?\b/, "cable"], [/\bkits?\b/, "kit"], [/\b(?:adapter|breakout)\b/, "adapter"],
];
const INTERFACES = [[/\b(?:i2c|iic)\b/, "I2C"], [/\bspi\b/, "SPI"]];
const COLOR = /\b(blue|green|black|white|red|yellow|transparent|transperant|clear)\b/;
const COLORS = { transperant: "transparent", clear: "transparent" };
// words that make a different product of the same chip
const VARIANT_WORDS = new Set([
  "cam", "camera", "mini", "supermini", "display", "oled", "lcd", "tft", "touch", "relay", "uno", "nano", "mega",
  "pro", "wroom", "wrover", "lora", "gps", "keypad", "zero", "pico", "minima", "rgb", "waterproof", "probe",
  // kinds of the same value: a 10k thermistor or trimmer is not a 10k resistor
  "ntc", "ptc", "thermistor", "ceramic", "carbon", "metal", "film", "network", "potentiometer", "trimmer", "variable",
  "solid", "ssr",
]);
// USB chips and the like: boards carry one or another without being a different product
const NOISE = new Set(["cp2102", "ch340", "ch340c", "ch340g", "ch9102", "ch9102x"]);
// where it's made and how it's sold, which says nothing about which product it is
const FILLER = new Set(["china", "chinese", "original", "genuine", "clone", "copy", "new", "high", "quality", "made", "in", "st"]);
const UNITS = { v: "V", mv: "V", vdc: "V", vac: "V", a: "A", ma: "A", w: "W", watt: "W", kw: "W", ohm: "Ω", r: "Ω", kohm: "Ω", k: "Ω", uf: "F", nf: "F", pf: "F", mah: "mAh", mm: "mm" };
const SCALE = { ma: 1e-3, kw: 1e3, k: 1e3, kohm: 1e3, nf: 1e-3, pf: 1e-6 };
const VALUE = /^(\d+(?:\.\d+)?)(v|mv|vdc|vac|a|ma|w|watt|kw|ohm|r|kohm|k|uf|nf|pf|mah|mm)$/;

const hasDigit = (s) => /\d/.test(s);
const digitsOf = (s) => (s.match(/\d+/g) || []).reduce((a, b) => (b.length > a.length ? b : a), "");
// "10k" -> "Ω 10000", "100nf" -> "F 0.1", so values compare whatever way they're written
function valueOf(t) {
  const v = t.match(VALUE);
  return v ? `${UNITS[v[2]]} ${+(v[1] * (SCALE[v[2]] || 1)).toPrecision(6)}` : null;
}

// the details of one product name, for a given query
export function details(query, name) {
  const n = name.toLowerCase().replace(/[Ωω]/g, "ohm")
    // "1/4W" is a quarter watt, not 4W; "30 Pin" and "30-pin" are one detail
    .replace(/(\d+)\s*\/\s*(\d+)\s*(w|watt)\b/g, (_, a, b) => `${+a / +b}w`)
    .replace(/(\d+)\s*-?\s*pins?\b/g, "$1pin")
    // "Rev3" and "R3" are one revision
    .replace(/\brev\.?\s*(\d)\b/g, "r$1")
    // "with cable" and "without case" say what comes in the box, not what the product is
    .replace(/\bwith(?:out)?\s+(?:a\s+)?(?:cables?|case|shell|holders?|kit|adapter|shield)\b/g, " ");
  const d = { model: [], words: [], text: new Set() };
  for (const [re, v] of PACKAGES) if (re.test(n)) { d.package = v; break; }
  // read once, so "TO-220" doesn't also leave a model code "220" behind
  const rest = PACKAGES.reduce((s, [re]) => s.replace(new RegExp(re, "g"), " "), n);
  for (const [re, v] of FORMS) if (re.test(n)) { d.form = v; break; }
  for (const [re, v] of INTERFACES) if (re.test(n)) { d.iface = v; break; }
  const c = n.match(COLOR);
  if (c) d.color = COLORS[c[1]] || c[1];

  // what every result shares doesn't tell results apart: the query's own values, words and part
  // number (L7805CV for LM7805, 1602 for 16x2)
  const q = tokens(query);
  const queryValues = new Set(q.map(valueOf).filter(Boolean));
  const partNumbers = q.filter((w) => hasDigit(w) && /[a-z]/.test(w) && !VALUE.test(w))
    .map((w) => { const core = digitsOf(w); return { core, prefix: w.slice(0, w.indexOf(core)) }; })
    .filter((p) => p.core.length >= 3);
  for (const t of tokens(rest)) {
    // pack counts are compared as the pack size
    // and 3 pins or fewer is every regulator and transistor; 30 and 38 pins are different boards
    if (NOISE.has(t) || FILLER.has(t) || /^\d+(?:pcs|pc|pieces)$/.test(t) || /^[1-3]pin$/.test(t)) continue;
    const v = valueOf(t);
    if (v) {
      const [unit, value] = v.split(" ");
      if (!queryValues.has(v) && !(unit in d)) d[unit] = +value;
      continue;
    }
    // the searched part number with another maker's prefix is the same part (L7805CV); with an
    // unrelated one it's a different part that only shares the digits (IRFP360 for Mini360)
    const carrier = partNumbers.find((p) => t.includes(p.core));
    if (carrier) {
      const prefix = t.slice(0, t.indexOf(carrier.core));
      if (!(carrier.prefix.startsWith(prefix) || prefix.startsWith(carrier.prefix))) d.model.push(t);
      continue;
    }
    if (score(query, t) > 0) continue;
    if (hasDigit(t)) { if (!/^(?:to|sot|dip|sop|soic)\d+$/.test(t)) d.model.push(t); }
    else if (VARIANT_WORDS.has(t)) d.words.push(t);
    if (!hasDigit(t) && t.length > 1) d.text.add(t);
  }
  d.model = [...new Set(d.model)].sort().join(" ");
  d.words = [...new Set(d.words)].sort().join(" ");
  return d;
}

// how much two names' other words overlap, 0 to 1
function overlap(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}
const MIN_OVERLAP = 1 / 3;

// what must be the same in two products, even when one name leaves it out
const EXACT = ["form", "iface", "model", "words"];
// the same product costs about the same everywhere; an offer far off the others is likely
// something else under a vague name (an original among clones, a kit, a different board)
const PRICE_SPREAD = 2.5;

// Offers that are the same product, as [{ offers, seed, details }], each group's offers in the
// order given. `seed` is the offer whose name says the most, which names the group. Only offers
// with the same pack size are put together, so prices compare like for like.
export function groupOffers(query, offers) {
  const items = offers.map((p, i) => {
    const { text, ...d } = details(query, p.name);
    return { p, i, text, d: { ...d, pack: p.pack || 1 } };
  });
  // the names with the most details start the groups; the vaguer ones then join the one they fit
  const specific = (d) => Object.values(d).filter((v) => v !== undefined && v !== "").length;
  const order = [...items].sort((a, b) => specific(b.d) - specific(a.d) || a.i - b.i);
  const groups = [];
  for (const it of order) {
    const price = it.p.price;
    const fits = (g) => [...EXACT, "pack"].every((k) => (g.details[k] ?? "") === (it.d[k] ?? ""))
      && g.members.every((m) => price <= m.p.price * PRICE_SPREAD && m.p.price <= price * PRICE_SPREAD)
      // a vague name is usually the through-hole part, so it doesn't join an SMD one
      && (g.details.package === "SMD") === (it.d.package === "SMD")
      // and a name with other words of its own shares some with the group ("LDR relay module"
      // and "humidity sensor relay module" are different); a bare "L7805CV" can join any
      && (!it.text.size || g.members.some((m) => !m.text.size || overlap(it.text, m.text) >= MIN_OVERLAP))
      // everything else it names, the group names the same way: a name with a detail the group
      // lacks might be a different product, so it starts its own
      && Object.keys(it.d).every((k) => it.d[k] === undefined || it.d[k] === "" || g.details[k] === it.d[k]);
    const g = groups.filter(fits).sort((a, b) => b.members.length - a.members.length)[0];
    if (g) g.members.push(it);
    else groups.push({ details: it.d, members: [it] });
  }
  return groups
    .map((g) => ({ details: g.details, seed: g.members[0].p, offers: [...g.members].sort((a, b) => a.i - b.i).map((m) => m.p) }))
    .sort((a, b) => offers.indexOf(a.offers[0]) - offers.indexOf(b.offers[0]));
}

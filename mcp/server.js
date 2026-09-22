#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// An MCP server that lets an AI assistant search the same shops as parts.ahmedshaalan.com.
// It runs on your own machine over stdio and reuses the site's code in ../src/js, asking the
// shops directly: outside a browser there is no CORS, so the relay isn't needed.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// the shops answer the way they answer a browser, as they do through the relay
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(BROWSER_HEADERS)) if (!headers.has(name)) headers.set(name, value);
  return nativeFetch(url, { ...init, headers });
};

// imported after fetch is set up, and from the site itself so both always match the same way
const { SHOPS, SHOPS_BY_KEY } = await import("../src/js/shops.js");
const { searchAll, priceList, cheapestPicks, shopTotals, lineCost, packsNeeded } = await import("../src/js/search.js");
const { STRONG } = await import("../src/js/matching.js");

const SITE = "https://parts.ahmedshaalan.com";
const SHOP_KEYS = SHOPS.map((s) => s.key);

const server = new McpServer(
  { name: "egypt-parts", version: "2.0.0" },
  {
    instructions: [
      `Searches ${SHOPS.length} Egyptian electronics shops at once (the same search as ${SITE}).`,
      "Prices are in Egyptian pounds (EGP) and only in-stock products are returned.",
      "Results are ranked by how well the name matches; a weak match may be a different part, so check it before relying on it.",
      "A pack (\"10pcs\") is priced per pack; unit_price is per piece.",
      "Searches are cached for an hour, so repeating one is cheap.",
    ].join(" "),
  },
);

const round = (n) => Math.round(n * 100) / 100;

// what the assistant needs of a product, without the image and internal fields
function product(p) {
  return {
    name: p.name,
    shop: p.shop_name,
    shop_key: p.shop,
    ref: p.ref,
    price: p.price,
    ...(p.old_price ? { old_price: p.old_price } : {}),
    ...(p.pack > 1 ? { pack: p.pack, unit_price: p.unit_price } : {}),
    match: p.score >= STRONG ? "strong" : "weak",
    url: p.url,
  };
}

const failures = (shops) =>
  shops.filter((s) => !s.ok).map((s) => ({ shop: s.name, error: s.error }));

// progress notifications, when the client asked for them
function progress(extra) {
  const token = extra._meta?.progressToken;
  if (token === undefined) return undefined;
  return (done, total) =>
    extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: done, total } })
      .catch(() => {});
}

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });

server.registerTool(
  "search_parts",
  {
    title: "Search parts",
    description:
      "Search every shop for one part (a name, model number or value, e.g. \"LM7805\", \"10k resistor\", " +
      "\"ESP32 dev board\"). Returns in-stock products, best match first, then cheapest. " +
      "Takes up to about 25 seconds the first time; repeats within an hour are instant.",
    inputSchema: {
      query: z.string().min(1).max(200).describe("The part to search for"),
      shops: z.array(z.enum(SHOP_KEYS)).optional().describe("Only return results from these shops (keys from list_shops)"),
      limit: z.number().int().min(1).max(100).default(20).describe("Most results to return"),
      include_weak: z.boolean().default(false).describe("Also return weak matches, which are often a different part"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, shops, limit, include_weak }, extra) => {
    const result = await searchAll(query, { onProgress: progress(extra), cancel: extra.signal });
    let results = result.results;
    if (shops?.length) results = results.filter((r) => shops.includes(r.shop));
    const strong = results.filter((r) => r.score >= STRONG);
    const shown = include_weak ? results : strong;
    return json({
      query,
      results: shown.slice(0, limit).map(product),
      total_found: shown.length,
      ...(include_weak ? {} : { weak_matches_hidden: results.length - strong.length }),
      failed_shops: failures(result.shops),
      searched_at: result.searched_at,
      link: `${SITE}/?q=${encodeURIComponent(query)}`,
    });
  },
);

server.registerTool(
  "price_parts_list",
  {
    title: "Price a parts list",
    description:
      "Price a whole parts list, one part per line, with an optional quantity (\"LM7805 x2\", \"2x LM7805\", " +
      "\"LM7805, 2\", \"2pcs LM7805\"). For each line it picks the cheapest close match for the quantity " +
      "(counting packs), then totals the cheapest mix of shops and what each shop alone would cost. " +
      `At most 40 lines. A 10-part list takes up to a minute.`,
    inputSchema: {
      list: z.string().min(1).max(10_000).describe("The parts list, one part per line"),
      alternatives: z.number().int().min(0).max(10).default(3).describe("Other options to show per line"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ list, alternatives }, extra) => {
    const data = await priceList(list, progress(extra));
    const picks = cheapestPicks(data.lines);
    const option = (line, c) => ({ ...product(c), packs: packsNeeded(line, c), cost: round(lineCost(line, c)) });

    let mixTotal = 0;
    const mixShops = new Set();
    const lines = data.lines.map((line, i) => {
      const pick = line.candidates[picks[i]];
      if (pick) {
        mixTotal += lineCost(line, pick);
        mixShops.add(pick.shop_name);
      }
      return {
        part: line.query,
        qty: line.qty,
        // a weak line found nothing close: the pick is a guess worth checking
        match: !line.candidates.length ? "none" : line.weak ? "weak" : "strong",
        pick: pick ? option(line, pick) : null,
        alternatives: line.candidates
          .filter((c) => c !== pick)
          .sort((a, b) => lineCost(line, a) - lineCost(line, b))
          .slice(0, alternatives)
          .map((c) => option(line, c)),
      };
    });

    const totals = shopTotals(data, picks);
    const complete = totals.filter((s) => !s.missing.length);
    return json({
      lines,
      cheapest_mix: {
        total: round(mixTotal),
        parts_found: `${lines.filter((l) => l.pick).length}/${lines.length}`,
        shops: [...mixShops],
      },
      one_shop: complete[0]
        ? { shop: complete[0].name, total: round(complete[0].total) }
        : null,
      shops_by_coverage: totals.slice(0, 5).map((s) => ({
        shop: s.name,
        total: round(s.total),
        missing: s.missing,
      })),
      failed_shops: data.failed_shops.map((s) => ({ shop: s.name, error: s.error })),
      ...(data.left_out ? { lines_left_out: data.left_out } : {}),
    });
  },
);

server.registerTool(
  "check_price",
  {
    title: "Check a product's price",
    description:
      "Re-check one product's current price and stock at its shop, using the shop_key and ref from a search result.",
    inputSchema: {
      shop_key: z.enum(SHOP_KEYS).describe("The product's shop_key"),
      ref: z.string().min(1).max(200).describe("The product's ref"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ shop_key, ref }, extra) => {
    const shop = SHOPS_BY_KEY[shop_key];
    const found = await shop.check(ref, extra.signal);
    return json(found ? { shop: shop.name, ref, ...found } : { shop: shop.name, ref, listed: false });
  },
);

server.registerTool(
  "list_shops",
  {
    title: "List shops",
    description: "The shops searched, with the keys the other tools take.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => json(SHOPS.map((s) => ({ key: s.key, name: s.name, url: s.base, platform: s.platform }))),
);

await server.connect(new StdioServerTransport());

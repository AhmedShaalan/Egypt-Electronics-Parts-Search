// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Cloudflare Worker that relays requests to shops that block browsers (see worker/).
const PRODUCTION_RELAY = "https://egypt-parts-relay.ahmed-shaalan.workers.dev";
const LOCAL_RELAY = "http://localhost:8787";

// outside a browser (the MCP server in mcp/) there is no CORS, so shops are asked directly
const inBrowser = typeof location !== "undefined";
const isLocal = inBrowser && ["localhost", "127.0.0.1"].includes(location.hostname);
export const RELAY_URL = !inBrowser ? null : isLocal ? LOCAL_RELAY : PRODUCTION_RELAY;

export const SHOP_TIMEOUT_MS = 25_000; // slow shops get marked failed after this
export const CACHE_MS = 60 * 60 * 1000; // search results are reused for an hour
export const PARTIAL_CACHE_MS = 2 * 60 * 1000; // results with a failed shop are retried sooner
export const MAX_LIST_LINES = 40;

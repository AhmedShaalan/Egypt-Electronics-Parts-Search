// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Relay for shops that don't allow browsers on other sites to read their data (no CORS).
// It only talks to the shops listed below, only answers the site's own origins,
// and caches shop responses for an hour so the shops aren't hit on every search.

const SHOP_HOSTS = new Set([
  "www.ram-e-shop.com",
  "makerselectronics.com",
  "microohm-eg.com",
  "mostelectronic.com",
  "ampere-electronics.com",
  "uge-one.com",
  "lampatronics.com",
  "store.fut-electronics.com",
  "devboardsmarket.com",
  "free-electronic.com",
  "hdelectronicseg.com",
  "circuit-electronics.com",
  "electra.store",
]);

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// headers the page may pass through to a shop
const FORWARDED_HEADERS = ["x-api-key", "content-type", "accept"];
const CACHE_SECONDS = 3600;
const MAX_BODY = 4096;
const MAX_BYTES = 256 * 1024; // the most a page can ask to be kept of a shop's response
const MAX_REDIRECTS = 5;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = isAllowedOrigin(origin, env);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": FORWARDED_HEADERS.join(", "),
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed) return text("Origin not allowed", 403, cors);
    if (request.method !== "GET" && request.method !== "POST") return text("Method not allowed", 405, cors);

    const params = new URL(request.url).searchParams;
    const target = params.get("url");
    let url;
    try {
      url = new URL(target);
    } catch {
      return text("Missing or invalid ?url=", 400, cors);
    }
    if (url.protocol !== "https:" || !SHOP_HOSTS.has(url.hostname)) {
      return text("Shop not allowed", 403, cors);
    }

    // a page that only needs the top of a long document (a product page's head) can ask for
    // the first bytes of it, so the rest never crosses the wire
    const bytes = Math.min(Math.max(Number(params.get("bytes")) || 0, 0), MAX_BYTES);

    const body = request.method === "POST" ? await request.text() : null;
    if (body && body.length > MAX_BODY) return text("Body too large", 413, cors);

    const headers = { ...BROWSER_HEADERS };
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }

    // POST responses can't be cached by URL alone, so the cache key includes the body
    const cache = caches.default;
    // and the headers passed through, which can change the answer too
    const forwarded = FORWARDED_HEADERS.map((name) => headers[name] || "").join("\n");
    const cacheKey = new Request(
      `https://relay-cache.internal/${request.method}/${await sha256([url.href, body || "", forwarded, bytes].join("\n"))}`,
    );
    const hit = await cache.match(cacheKey);
    if (hit) return withHeaders(hit, { ...cors, "X-Relay-Cache": "HIT" });

    // redirects are followed here, so each hop can be held to the same list of shops
    let upstream;
    try {
      let method = request.method;
      let payload = body;
      for (let hops = 0; ; hops++) {
        upstream = await fetch(url.href, { method, headers, body: payload, redirect: "manual" });
        const location = upstream.headers.get("Location");
        if (upstream.status < 300 || upstream.status >= 400 || !location) break;
        if (hops >= MAX_REDIRECTS) return text("Too many redirects", 502, cors);
        url = new URL(location, url);
        if (url.protocol !== "https:" || !SHOP_HOSTS.has(url.hostname)) return text("Shop redirected elsewhere", 502, cors);
        // like a browser: a POST that is redirected (other than 307/308) becomes a GET
        if (upstream.status !== 307 && upstream.status !== 308) [method, payload] = ["GET", null];
      }
    } catch (err) {
      return text(`Shop unreachable: ${err.message}`, 502, cors);
    }

    const response = new Response(bytes ? (await upstream.arrayBuffer()).slice(0, bytes) : upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        // only a good answer is kept, by the browser too: an error is asked again next time
        "Cache-Control": upstream.status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
      },
    });
    if (upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withHeaders(response, { ...cors, "X-Relay-Cache": "MISS" });
  },
};

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  // local development: http://localhost:<any port>
  return env.ALLOW_LOCALHOST === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function withHeaders(response, extra) {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  return out;
}

function text(message, status, headers) {
  return new Response(message, { status, headers: { ...headers, "Content-Type": "text/plain" } });
}

async function sha256(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

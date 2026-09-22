// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// One connector per store platform. Each shop can search, and re-check a saved product's price.
//
// Shopify, El Gammal, MTM, VoltX and Electra's catalog allow browsers to read their data
// directly. The others don't (no CORS), so their requests go through the Cloudflare Worker
// relay in worker/. Outside a browser, as in the MCP server, every shop is asked directly.

import { RELAY_URL } from "./config.js";
import { score, WEAK } from "./matching.js";

const HOUR = 60 * 60 * 1000;

function relay(url, { method = "GET", headers = {}, body, signal, bytes } = {}) {
  if (!RELAY_URL) return fetch(url, { method, headers, body, signal });
  const params = new URLSearchParams({ url });
  // only the start of a long page is needed sometimes; the relay drops the rest
  if (bytes) params.set("bytes", String(bytes));
  return fetch(`${RELAY_URL}/?${params}`, { method, headers, body, signal });
}

async function ok(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const decoder = globalThis.document?.createElement("textarea");
// without a browser to decode with, the entities shop names actually use
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", times: "×", deg: "°", micro: "µ", Omega: "Ω", plusmn: "±", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…" };
function unescapeHtml(s) {
  if (!decoder) {
    return String(s || "").replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] !== "#" ? ENTITIES[e] ?? m : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))));
  }
  decoder.innerHTML = s || "";
  return decoder.value;
}

export function cleanName(s) {
  return unescapeHtml(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// "EGP 1,250.00" -> 1250. For a range like "27.00 - 35.00" it takes the lowest price.
export function parseMoney(s) {
  if (typeof s === "number") return s;
  const m = String(s ?? "").match(/\d[\d,]*(?:\.\d+)?/);
  return m ? parseFloat(m[0].replaceAll(",", "")) : 0;
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

class Shop {
  constructor(key, name, base) {
    Object.assign(this, { key, name, base });
  }

  // A shop whose cart can be filled from a link also has cartSteps(items): the links that put
  // products into its cart, visited in order in one tab, the last one showing the cart.
  // `items` are products marked `cart`, each with the `qty` wanted.
}

class WooShop extends Shop {
  platform = "WooCommerce";
  api = "wc/store/v1"; // older installs only answer on the unversioned "wc/store"

  // WooCommerce Store API. Prices come in minor units (piasters).
  async search(query, signal) {
    const params = new URLSearchParams({ search: query, per_page: "60", "stock_status[]": "instock" });
    const r = await ok(await relay(`${this.base}/wp-json/${this.api}/products?${params}`, { signal }));
    return this.parse(await r.text()).map((d) => this.product(d)).filter((p) => p.price > 0);
  }

  parse(text) {
    // some shops put raw control characters inside product JSON
    return JSON.parse(text.replace(/[\u0000-\u001f]/g, " "));
  }

  // A product sold in several colours or sizes (a variable product): what's chosen ("colour",
  // "number of pins"), the product's own name, and the choices it's sold in now, each its own
  // product at the shop ({ ref, label: "Blue" }); null for none. option() gets one of them.
  choices(d) {
    const variations = d.variations || [];
    const names = [...new Set(variations.flatMap((v) => v.attributes.map((a) => cleanName(a.name).toLowerCase())))];
    const choices = variations.map((v) => ({ ref: String(v.id), label: v.attributes.map((a) => cleanName(a.value)).join(" / ") }))
      .filter((c, i, all) => all.findIndex((x) => x.label === c.label) === i);
    if (choices.length < 2) return null;
    const what = names.every((n) => /colou?r/.test(n)) ? "colour" : names.join(" / ").replace(/\s*\(.*?\)/g, "");
    return { what, name: cleanName(d.name), choices };
  }

  // one choice of a product with options (see choices()), as a product of its own that its cart
  // takes as it is; null when the shop no longer has it
  async option(p, ref, signal) {
    const r = await relay(`${this.base}/wp-json/${this.api}/products/${encodeURIComponent(ref)}`, { signal });
    if (r.status === 404) return null;
    const d = this.parse(await (await ok(r)).text());
    const choice = p.options.choices.find((c) => c.ref === ref);
    // the link the shop's own page adds it with: the product, the choice and its attributes
    const add = new URL(cleanName(d.add_to_cart?.url || ""), this.base).searchParams;
    return {
      ...this.product(d),
      name: `${p.options.name} — ${choice?.label ?? ""}`,
      cart: d.is_purchasable !== false && add.has("add-to-cart"),
      ...(add.has("add-to-cart") ? { cart_query: add.toString() } : {}),
      options: { ...p.options, chosen: ref },
    };
  }

  product(d) {
    const prices = d.prices;
    const unit = 10 ** Number(prices.currency_minor_unit ?? 2);
    const price = Number(prices.price || 0) / unit;
    const regular = Number(prices.regular_price || 0) / unit;
    let image = d.images?.length ? d.images[0].thumbnail || d.images[0].src : null;
    if (image && this.imageCdn) image = this.imageCdn(image);
    // some products are only sold in multiples ("order in tens"); the cart refuses other amounts
    const { minimum = 1, multiple_of = 1 } = d.add_to_cart || {};
    const options = this.choices(d);
    return {
      shop: this.key,
      ref: String(d.id),
      name: cleanName(d.name),
      price,
      url: d.permalink,
      image,
      in_stock: Boolean(d.is_in_stock),
      old_price: regular > price ? regular : null,
      // a product with options (a variable product) needs one picked on the shop's page first
      cart: d.type === "simple" && d.is_purchasable !== false,
      ...(minimum > 1 || multiple_of > 1 ? { cart_rules: { minimum, multiple_of } } : {}),
      ...(options ? { options } : {}),
    };
  }

  // a link adds one product, landing on the cart page
  cartSteps(items) {
    return items.map((i) => {
      const { minimum = 1, multiple_of = 1 } = i.cart_rules || {};
      const qty = Math.max(minimum, Math.ceil(i.qty / multiple_of) * multiple_of);
      // a colour or size of a product is added with the product's id and the choice's (option())
      const add = i.cart_query || `add-to-cart=${encodeURIComponent(i.ref)}`;
      return `${this.base}/cart/?${add}&quantity=${qty}`;
    });
  }

  async check(ref, signal) {
    const r = await relay(`${this.base}/wp-json/${this.api}/products/${encodeURIComponent(ref)}`, { signal });
    if (r.status === 404) return null;
    const p = this.product(this.parse(await (await ok(r)).text()));
    return { price: p.price, in_stock: p.in_stock };
  }
}

// A shop whose own search is too limited to use, so the whole catalog is downloaded
// and searched here. It is kept for an hour; loadCatalog() fetches it.
class CatalogShop extends Shop {
  catalog() {
    if (!this.loading || Date.now() - this.loadedAt > HOUR) {
      this.loadedAt = Date.now();
      this.loading = this.loadCatalog().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    return this.loading;
  }
}

class ShopifyShop extends CatalogShop {
  platform = "Shopify";

  // Shopify's suggest search caps at 10 results.
  async loadCatalog() {
    const items = [];
    for (let page = 1; page <= 40; page++) {
      const r = await ok(await fetch(`${this.base}/products.json?limit=250&page=${page}`));
      const batch = (await r.json()).products;
      for (const p of batch) items.push(...this.variants(p));
      if (batch.length < 250) break;
    }
    return items;
  }

  variants(p) {
    let image = p.images?.length ? p.images[0].src : null;
    if (image) image += (image.includes("?") ? "&" : "?") + "width=160";
    const variants = p.variants || [];
    const multi = variants.length > 1;
    return variants.map((v) => {
      const price = parseFloat(v.price);
      const compare = parseFloat(v.compare_at_price || 0);
      return {
        shop: this.key,
        ref: `${p.handle}:${v.id}`,
        name: cleanName(p.title + (multi ? ` — ${v.title}` : "")),
        price,
        url: `${this.base}/products/${p.handle}` + (multi ? `?variant=${v.id}` : ""),
        image,
        in_stock: Boolean(v.available),
        old_price: compare > price ? compare : null,
        cart: true,
      };
    });
  }

  // one link takes every product, adding to what the cart already has, and lands on the cart
  // (a cart permalink, /cart/ID:QTY, would replace the cart instead)
  cartSteps(items) {
    const params = new URLSearchParams();
    items.forEach((it, n) => {
      params.set(`items[${n}][id]`, it.ref.slice(it.ref.lastIndexOf(":") + 1));
      params.set(`items[${n}][quantity]`, it.qty);
    });
    return [`${this.base}/cart/add?${params}`];
  }

  async search(query) {
    return (await this.catalog()).filter((p) => p.in_stock && p.price > 0 && score(query, p.name) >= WEAK);
  }

  async check(ref, signal) {
    const i = ref.lastIndexOf(":");
    const handle = ref.slice(0, i);
    const variantId = ref.slice(i + 1);
    const r = await fetch(`${this.base}/products/${handle}.js`, { signal });
    if (r.status === 404) return null;
    const v = (await (await ok(r)).json()).variants.find((x) => String(x.id) === variantId);
    return v ? { price: v.price / 100, in_stock: Boolean(v.available) } : null;
  }
}

class OdooShop extends Shop {
  platform = "Odoo";

  // Odoo website shop: parse the search results page, then look up stock per product.
  static MAX_PAGES = 3;

  constructor(...args) {
    super(...args);
    // Odoo slows down under parallel load, so all searches share a small request budget
    this.limit = limiter(5);
    this.info = new Map();
  }

  get(url, signal) {
    return this.limit(async () => ok(await relay(url, { signal })));
  }

  async search(query, signal) {
    const q = encodeURIComponent(query);
    const first = await (await this.get(`${this.base}/shop?search=${q}`, signal)).text();
    const pages = [first];
    const last = Math.max(1, ...[...first.matchAll(/\/shop\/page\/(\d+)/g)].map((m) => Number(m[1])));
    const more = [];
    for (let n = 2; n <= Math.min(last, OdooShop.MAX_PAGES); n++) {
      more.push(this.get(`${this.base}/shop/page/${n}?search=${q}`, signal).then((r) => r.text()).catch(() => ""));
    }
    pages.push(...(await Promise.all(more)));

    const cards = new Map();
    for (const page of pages) for (const p of this.parse(page)) cards.set(p.ref, p);
    // skip stock lookups for results that clearly don't match
    const candidates = [...cards.values()].filter((p) => score(query, p.name) >= WEAK);

    const checked = await Promise.all(
      candidates.map(async (p) => {
        try {
          const info = await this.combinationInfo(p.ref, signal);
          if (!info) return null;
          p.price = Number(info.price || p.price);
          p.in_stock = this.inStock(info);
          const listPrice = Number(info.list_price || 0);
          if (info.has_discounted_price && listPrice > p.price) p.old_price = listPrice;
          return p;
        } catch (err) {
          if (signal?.aborted) throw err;
          return null;
        }
      }),
    );
    return checked.filter((p) => p && p.in_stock && p.price > 0);
  }

  parse(page) {
    const out = [];
    for (const block of page.split('<form action="/shop/cart/update"').slice(1)) {
      const link = block.match(/<a[^>]*itemprop="name"[^>]*>/);
      const tmpl = block.match(/data-product-template-id="(\d+)"/);
      const prod = block.match(/name="product_id"[^>]*value="(\d+)"/);
      const price = block.match(/itemprop="price"[^>]*>([\d.,]+)</);
      if (!(link && tmpl && prod && price)) continue;
      const href = link[0].match(/href="([^"?]+)/);
      const content = link[0].match(/content="([^"]*)"/);
      const img = block.match(/<img src="([^"]+)"[^>]*itemprop="image"/);
      out.push({
        shop: this.key,
        ref: `${tmpl[1]}:${prod[1]}`,
        name: cleanName(content ? content[1] : ""),
        price: parseMoney(price[1]),
        url: href ? this.base + href[1] : this.base,
        image: img ? this.base + unescapeHtml(img[1]) : null,
        in_stock: true,
        old_price: null,
      });
    }
    return out;
  }

  async combinationInfo(ref, signal, fresh = false) {
    const hit = this.info.get(ref);
    if (hit && !fresh && Date.now() < hit.expires) return hit.info;
    const [tmpl, prod] = ref.split(":");
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { product_template_id: Number(tmpl), product_id: Number(prod), combination: [], add_qty: 1 },
    });
    const r = await this.limit(async () =>
      ok(await relay(`${this.base}/website_sale/get_combination_info`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal,
      })),
    );
    const info = (await r.json()).result || null;
    this.info.set(ref, { expires: Date.now() + HOUR, info });
    return info;
  }

  inStock(info) {
    const tracked = info.product_type === "product" || info.is_storable === true;
    return !tracked || Number(info.free_qty || 0) > 0;
  }

  async check(ref, signal) {
    const info = await this.combinationInfo(ref, signal, true);
    return info ? { price: Number(info.price || 0), in_stock: this.inStock(info) } : null;
  }
}

class LampatronicsShop extends Shop {
  platform = "Custom";

  // Custom Laravel/Vue store. Its API wants the key the site embeds in every page.
  static MAX_PAGES = 3;

  async apiKey(signal, refresh = false) {
    if (!this.key_ || refresh) {
      // a changing query string skips the relay's cache when the old key was rejected
      const r = await ok(await relay(`${this.base}/home${refresh ? `?_=${Date.now()}` : ""}`, { signal }));
      const m = (await r.text()).match(/APP_KEY\s*=\s*"([^"]+)"/);
      if (!m) throw new Error("API key not found on page");
      this.key_ = m[1];
    }
    return this.key_;
  }

  async api(path, signal) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = await this.apiKey(signal, attempt > 0);
      const r = await relay(`${this.base}/api/${path}`, {
        headers: { "x-api-key": key, accept: "application/json" },
        signal,
      });
      const text = await r.text();
      if (text.slice(0, 40).includes("Invalid Api Key")) continue;
      return { status: r.status, text };
    }
    throw new Error("API key rejected");
  }

  product(d) {
    const listed = parseMoney(d.currency_price);
    const discounted = d.discounted_price ? parseMoney(d.discounted_price) : listed;
    const price = discounted ? Math.min(listed, discounted) : listed;
    return {
      shop: this.key,
      ref: d.slug,
      name: cleanName(d.name),
      price,
      url: `${this.base}/product/${d.slug}`,
      image: d.cover || null,
      in_stock: Number(d.stock || 0) > 0,
      old_price: listed > price ? listed : null,
    };
  }

  async search(query, signal) {
    const out = [];
    for (let page = 1; page <= LampatronicsShop.MAX_PAGES; page++) {
      const params = new URLSearchParams({ name: query, paginate: "1", per_page: "50", page: String(page) });
      const { status, text } = await this.api(`frontend/product?${params}`, signal);
      if (status !== 200) throw new Error(`HTTP ${status}`);
      const body = JSON.parse(text);
      out.push(...(body.data || []).map((d) => this.product(d)));
      if (page >= Number(body.meta?.last_page || 1)) break;
    }
    return out.filter((p) => p.in_stock && p.price > 0);
  }

  async check(ref, signal) {
    const { status, text } = await this.api(`frontend/product/show/${encodeURIComponent(ref)}`, signal);
    if (status === 404) return null;
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const data = JSON.parse(text).data;
    if (!data) return null;
    const p = this.product(data);
    return { price: p.price, in_stock: p.in_stock };
  }
}

class ElGammalShop extends Shop {
  // Lovable storefront backed by Supabase. Its database API allows browsers directly (CORS),
  // using the public "anon" key the storefront itself ships with.
  platform = "Supabase";
  static API = "https://lackyfaornknmawcyldv.supabase.co/rest/v1";
  static ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhY2t5ZmFvcm5rbm1hd2N5bGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNjQyMDQsImV4cCI6MjA5MjY0MDIwNH0.Vdmae-sT-zW_lTUbKznYKXlRw1rzI7I-8A3toSWdhzY";

  constructor(...args) {
    super(...args);
    this.limit = limiter(6);
    this.stock = new Map();
  }

  api(path, { method = "GET", body, signal } = {}) {
    const key = ElGammalShop.ANON_KEY;
    return fetch(`${ElGammalShop.API}/${path}`, {
      method,
      body,
      signal,
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    });
  }

  product(d) {
    return {
      shop: this.key,
      ref: d.id,
      // names start with an internal code ("XX629-ESP32 30Pin ..."), which isn't useful to shoppers
      name: cleanName(d.name).replace(/^XX\d+\s*-?\s*/i, ""),
      price: Number(d.user_price || 0),
      url: `${this.base}/p/${d.slug}`,
      image: d.image_url || null,
      in_stock: true,
      old_price: null,
    };
  }

  async onlineStock(id, signal, fresh = false) {
    const hit = this.stock.get(id);
    if (hit && !fresh && Date.now() < hit.expires) return hit.quantity;
    const r = await this.limit(async () =>
      ok(await this.api("rpc/get_online_stock", { method: "POST", body: JSON.stringify({ _product_id: id }), signal })),
    );
    const quantity = Number(await r.json()) || 0;
    this.stock.set(id, { expires: Date.now() + HOUR, quantity });
    return quantity;
  }

  async search(query, signal) {
    // same filters as the shop's own search page; commas and parentheses would break the filter syntax
    const q = query.replace(/[,()*]/g, " ").trim();
    const params = new URLSearchParams({
      select: "id,name,slug,user_price,image_url",
      is_active: "eq.true",
      is_visible: "eq.true",
      is_online: "eq.true",
      or: `(name.ilike.*${q}*,barcode.ilike.*${q}*,tags.ilike.*${q}*)`,
      limit: "200",
    });
    const r = await ok(await this.api(`products?${params}`, { signal }));
    const candidates = (await r.json()).map((d) => this.product(d)).filter((p) => p.price > 0 && score(query, p.name) >= WEAK);
    const checked = await Promise.all(
      candidates.map(async (p) => {
        try {
          p.in_stock = (await this.onlineStock(p.ref, signal)) > 0;
          return p;
        } catch (err) {
          if (signal?.aborted) throw err;
          return null;
        }
      }),
    );
    return checked.filter((p) => p && p.in_stock);
  }

  async check(ref, signal) {
    const params = new URLSearchParams({
      select: "id,name,slug,user_price,image_url",
      id: `eq.${ref}`,
      is_active: "eq.true",
      is_visible: "eq.true",
      is_online: "eq.true",
    });
    const rows = await (await ok(await this.api(`products?${params}`, { signal }))).json();
    if (!rows.length) return null;
    const p = this.product(rows[0]);
    return { price: p.price, in_stock: (await this.onlineStock(ref, signal, true)) > 0 };
  }
}

class ElectraShop extends CatalogShop {
  // Custom Laravel store. Its product API allows browsers directly, but its search only matches
  // the query as a case-sensitive substring of the name ("ESP32" finds 31 products, "esp32" none),
  // so the whole catalog is downloaded and searched here instead. The API's stock_quantity is 0
  // for nearly everything and means nothing, so availability comes from the product page, where
  // the shop publishes it as schema.org data — the relay trims that page down to its head.
  platform = "Custom";
  static PER_PAGE = 1000;
  static MAX_PAGES = 10;
  static MAX_CHECKS = 20; // product pages read per search
  static HEAD_BYTES = 24 * 1024;

  constructor(...args) {
    super(...args);
    this.limit = limiter(6);
    this.offers = new Map();
  }

  async page(n) {
    const params = new URLSearchParams({ per_page: String(ElectraShop.PER_PAGE), page: String(n) });
    const r = await this.limit(() => fetch(`${this.base}/api/v1/products?${params}`));
    return (await ok(r)).json();
  }

  async loadCatalog() {
    // the first page says how many there are, so the rest can be fetched together
    const first = await this.page(1);
    const last = Math.min(Number(first.last_page || 1), ElectraShop.MAX_PAGES);
    const rest = await Promise.all(Array.from({ length: last - 1 }, (_, i) => this.page(i + 2)));
    return [first, ...rest].flatMap((body) => (body.data || []).map((d) => this.product(d)));
  }

  product(d) {
    const listed = parseMoney(d.price);
    const special = parseMoney(d.special_price);
    const price = special > 0 && special < listed ? special : listed;
    return {
      shop: this.key,
      ref: d.slug,
      name: cleanName(d.name),
      price,
      url: `${this.base}/products/${d.slug}`,
      image: d.image_url ? this.base + d.image_url : null,
      in_stock: true,
      old_price: listed > price ? listed : null,
    };
  }

  // the schema.org Offer in the product page's head: the price shoppers see, and whether
  // the part can actually be bought (the shop also lists back-ordered parts)
  async offer(slug, signal, fresh = false) {
    const hit = this.offers.get(slug);
    if (hit && !fresh && Date.now() < hit.expires) return hit.offer;
    const r = await this.limit(async () =>
      relay(`${this.base}/products/${encodeURIComponent(slug)}`, { signal, bytes: ElectraShop.HEAD_BYTES }),
    );
    let offer = null;
    if (r.status !== 404) {
      const head = await (await ok(r)).text();
      const availability = head.match(/"availability"\s*:\s*"[^"]*\/(\w+)"/);
      const price = head.match(/"priceCurrency"\s*:\s*"[A-Z]+"\s*,\s*"price"\s*:\s*"([\d.,]+)"/);
      // a page that can't be read says nothing about the product, so it isn't "no longer listed"
      if (!availability || !price) throw new Error("Offer not found on product page");
      offer = { in_stock: availability[1] === "InStock", price: parseMoney(price[1]) };
    }
    this.offers.set(slug, { expires: Date.now() + HOUR, offer });
    return offer;
  }

  async search(query, signal) {
    // only the best matches are worth a product page each
    const candidates = (await this.catalog())
      .map((p) => ({ p, s: score(query, p.name) }))
      .filter(({ p, s }) => p.price > 0 && s >= WEAK)
      .sort((a, b) => b.s - a.s)
      .slice(0, ElectraShop.MAX_CHECKS);

    const checked = await Promise.all(
      candidates.map(async ({ p }) => {
        try {
          const offer = await this.offer(p.ref, signal);
          if (!offer || !offer.in_stock) return null;
          const price = offer.price || p.price;
          return { ...p, price, old_price: p.old_price > price ? p.old_price : null };
        } catch (err) {
          if (signal?.aborted) throw err;
          return null;
        }
      }),
    );
    return checked.filter((p) => p && p.price > 0);
  }

  async check(ref, signal) {
    const offer = await this.offer(ref, signal, true);
    if (!offer) return null;
    return { price: offer.price, in_stock: offer.in_stock };
  }
}

class MtmShop extends CatalogShop {
  // Next.js storefront on a Laravel backend. The backend hands out the whole catalog in one
  // request and allows browsers directly, so the search runs here; its own search only matches
  // the query as a single substring of the name ("10k resistor" finds nothing). Close to half
  // the catalog carries no price, and those products are left out: there is nothing to compare.
  platform = "Custom";

  get api() {
    return `${this.base}/backend/public/api/products`;
  }

  async loadCatalog() {
    const rows = await (await ok(await fetch(this.api))).json();
    return rows.map((d) => this.product(d));
  }

  product(d) {
    return {
      shop: this.key,
      ref: String(d.id),
      name: cleanName(d.name),
      price: parseMoney(d.price),
      url: `${this.base}/products/${d.id}`,
      image: d.images?.[0]?.image || null,
      in_stock: Number(d.amount || 0) > 0,
      old_price: null,
    };
  }

  async search(query) {
    return (await this.catalog()).filter((p) => p.in_stock && p.price > 0 && score(query, p.name) >= WEAK);
  }

  async check(ref, signal) {
    // one product comes back the same way the catalog does: as a list
    const rows = await (await ok(await fetch(`${this.api}/${encodeURIComponent(ref)}`, { signal }))).json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const p = this.product(rows[0]);
    return { price: p.price, in_stock: p.in_stock };
  }
}

class VoltxShop extends Shop {
  // Next.js storefront with its own JSON search API, which allows browsers directly.
  // Results carry price, offer and stock, so one request answers a search.
  platform = "Custom";

  get api() {
    return `${this.base}/api/products`;
  }

  async search(query, signal) {
    const url = `${this.api}/search/public?q=${encodeURIComponent(query)}&limit=160`;
    const { results } = await (await ok(await fetch(url, { signal }))).json();
    return (results || []).map((d) => this.product(d)).filter((p) => p.in_stock && p.price > 0);
  }

  price(d) {
    const sell = parseMoney(d.sell_price);
    const offer = d.is_offer ? parseMoney(d.offer_price) : 0;
    return offer > 0 && offer < sell ? { price: offer, old_price: sell } : { price: sell, old_price: null };
  }

  product(d) {
    return {
      shop: this.key,
      ref: String(d.product_id),
      name: cleanName(d.name),
      ...this.price(d),
      url: this.base + (d.url || `/product/${d.slug}`),
      image: d.primary_media ? this.base + d.primary_media : null,
      in_stock: d.in_stock === true,
    };
  }

  async check(ref, signal) {
    // kits ("bundle_6") are looked up as bundles, which carry a status but no stock count
    const bundle = ref.match(/^bundle_(\d+)$/);
    const r = await fetch(bundle ? `${this.base}/api/bundles/${bundle[1]}` : `${this.api}/${encodeURIComponent(ref)}`, { signal });
    if (r.status === 404) return null;
    const d = await (await ok(r)).json();
    if (bundle) {
      if (!d?.bundle_id) return null;
      return { ...this.price({ ...d, sell_price: d.total_price }), in_stock: d.status !== "out_of_stock" };
    }
    if (!d?.product_id) return null;
    return { ...this.price(d), in_stock: Number(d.stock_quantity || 0) > 0 };
  }
}

class MechatronxShop extends Shop {
  // Laravel storefront with its own JSON product API, which doesn't allow browsers (relay). A
  // search is one request for up to 100 products with price, offer and stock. A product with
  // options ("Resistor 1/4W" in 88 values) comes back as one entry with no stock of its own; its
  // options are products with their own price and stock, read from the product itself for the
  // first few such entries, and kept for an hour.
  platform = "Custom";
  static OPTION_PARENTS = 5;

  constructor(...args) {
    super(...args);
    this.options = new Map();
  }

  get api() {
    return `${this.base}/api/products`;
  }

  async search(query, signal) {
    const params = new URLSearchParams({ search: query, per_page: "100" });
    const { data = [] } = await (await ok(await relay(`${this.api}?${params}`, { signal }))).json();
    const parents = data.filter((d) => d.isVariantParent).slice(0, MechatronxShop.OPTION_PARENTS);
    const options = await Promise.all(parents.map((d) => this.optionsOf(d, signal).catch(() => [])));
    return [...data.filter((d) => !d.isVariantParent).map((d) => this.product(d)), ...options.flat()]
      .filter((p) => p.in_stock && p.price > 0);
  }

  optionsOf(parent, signal) {
    const kept = this.options.get(parent.slug);
    if (kept && Date.now() - kept.at < HOUR) return kept.rows;
    const rows = (async () => {
      const { data } = await (await ok(await relay(`${this.api}/${encodeURIComponent(parent.slug)}`, { signal }))).json();
      return (data?.variations || []).map((v) => this.product(v, parent));
    })();
    this.options.set(parent.slug, { at: Date.now(), rows });
    rows.catch(() => this.options.delete(parent.slug));
    return rows;
  }

  // an option is named after its product and its values: "Resistor 1/4W (1Pcs) — 10k Ohm". Its
  // own name is often a code ("LED 5MM-T-BLUE") or leaves the value out.
  optionName(parent, v) {
    const values = Object.entries(v.attributes || {}).map(([k, x]) =>
      (/resist/i.test(k) && /^[\d.]+[kKmM]?$/.test(x) ? `${x} Ohm` : x));
    return cleanName(values.length ? `${parent.name} — ${values.join(" / ")}` : v.name);
  }

  // the API gives the full-size image, up to 2000px and 400 KB; the shop's own cards use a
  // small WebP copy of it
  card(image) {
    return image ? image.replace(/\/storage\/products\/main\/([^/]+)\.\w+$/, "/storage/products/card/$1.webp") : null;
  }

  product(d, parent) {
    const price = Number(d.price || 0);
    const regular = Number(d.originalPrice || 0);
    return {
      shop: this.key,
      ref: String(d.id),
      name: parent ? this.optionName(parent, d) : cleanName(d.name),
      price,
      url: parent ? `${this.base}/product/${parent.slug}?variant=${d.id}` : `${this.base}/product/${d.slug}`,
      image: this.card(d.image || parent?.image),
      in_stock: d.inStock === true && d.availableOnline !== false && !d.comingSoon,
      old_price: regular > price ? regular : null,
    };
  }

  async check(ref, signal) {
    const r = await relay(`${this.api}/${encodeURIComponent(ref)}`, { signal });
    if (r.status === 404) return null;
    const { data } = await (await ok(r)).json();
    if (!data?.id) return null;
    const p = this.product(data);
    return { price: p.price, in_stock: p.in_stock };
  }
}

export const SHOPS = [
  new OdooShop("ram", "RAM Electronics", "https://www.ram-e-shop.com"),
  Object.assign(new WooShop("makers", "Makers Electronics", "https://makerselectronics.com"), {
    // The site sits behind a JavaScript browser check that also blocks direct <img> loads
    // of /wp-content/uploads/. Jetpack's image CDN can still fetch from the origin.
    imageCdn: (url) => url.replace(/^https?:\/\/(www\.)?makerselectronics\.com\//, "https://i0.wp.com/makerselectronics.com/"),
  }),
  new ShopifyShop("future", "Future Electronics", "https://store.fut-electronics.com"),
  new WooShop("microohm", "Micro Ohm", "https://microohm-eg.com"),
  new WooShop("most", "Most Electronic", "https://mostelectronic.com"),
  new ShopifyShop("devboards", "DevBoards Market", "https://devboardsmarket.com"),
  new LampatronicsShop("lampatronics", "Lampatronics", "https://lampatronics.com"),
  new WooShop("uge", "UGE", "https://uge-one.com"),
  new WooShop("ampere", "Ampere Electronics", "https://ampere-electronics.com"),
  new ElGammalShop("elgammal", "El Gammal Electronics", "https://el-gammal.com"),
  new WooShop("free", "Free Electronics", "https://free-electronic.com"),
  new WooShop("hd", "HD Electronics", "https://hdelectronicseg.com"),
  Object.assign(new WooShop("circuit", "Circuit Electronics", "https://circuit-electronics.com"), { api: "wc/store" }),
  new ElectraShop("electra", "Electra Store", "https://electra.store"),
  new MtmShop("mtm", "MTM Electronics", "https://mtm-electronic.com"),
  new VoltxShop("voltx", "VoltX Electronics", "https://voltx-store.com"),
  new MechatronxShop("mechatronx", "Mechatronx", "https://mecha-tronx.com"),
];
export const SHOPS_BY_KEY = Object.fromEntries(SHOPS.map((s) => [s.key, s]));

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// One connector per store platform. Each shop can search, and re-check a saved product's price.
//
// Shopify shops allow browsers to read their data directly. The others don't (no CORS),
// so their requests go through the Cloudflare Worker relay in worker/.

import { RELAY_URL } from "./config.js";
import { score, WEAK } from "./matching.js";

const HOUR = 60 * 60 * 1000;

function relay(url, { method = "GET", headers = {}, body, signal } = {}) {
  return fetch(`${RELAY_URL}/?url=${encodeURIComponent(url)}`, { method, headers, body, signal });
}

async function ok(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const decoder = document.createElement("textarea");
function unescapeHtml(s) {
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
}

class WooShop extends Shop {
  platform = "WooCommerce";

  // WooCommerce Store API. Prices come in minor units (piasters).
  async search(query, signal) {
    const params = new URLSearchParams({ search: query, per_page: "60", "stock_status[]": "instock" });
    const r = await ok(await relay(`${this.base}/wp-json/wc/store/v1/products?${params}`, { signal }));
    return this.parse(await r.text()).map((d) => this.product(d)).filter((p) => p.price > 0);
  }

  parse(text) {
    // some shops put raw control characters inside product JSON
    return JSON.parse(text.replace(/[\u0000-\u001f]/g, " "));
  }

  product(d) {
    const prices = d.prices;
    const unit = 10 ** Number(prices.currency_minor_unit ?? 2);
    const price = Number(prices.price || 0) / unit;
    const regular = Number(prices.regular_price || 0) / unit;
    const image = d.images?.length ? d.images[0].thumbnail || d.images[0].src : null;
    return {
      shop: this.key,
      ref: String(d.id),
      name: cleanName(d.name),
      price,
      url: d.permalink,
      image,
      in_stock: Boolean(d.is_in_stock),
      old_price: regular > price ? regular : null,
    };
  }

  async check(ref, signal) {
    const r = await relay(`${this.base}/wp-json/wc/store/v1/products/${encodeURIComponent(ref)}`, { signal });
    if (r.status === 404) return null;
    const p = this.product(this.parse(await (await ok(r)).text()));
    return { price: p.price, in_stock: p.in_stock };
  }
}

class ShopifyShop extends Shop {
  platform = "Shopify";

  // Shopify's suggest search caps at 10 results, so load the whole catalog and search it locally.
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
      };
    });
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

export const SHOPS = [
  new OdooShop("ram", "RAM Electronics", "https://www.ram-e-shop.com"),
  new WooShop("makers", "Makers Electronics", "https://makerselectronics.com"),
  new ShopifyShop("future", "Future Electronics", "https://store.fut-electronics.com"),
  new WooShop("microohm", "Micro Ohm", "https://microohm-eg.com"),
  new WooShop("most", "Most Electronic", "https://mostelectronic.com"),
  new ShopifyShop("devboards", "DevBoards Market", "https://devboardsmarket.com"),
  new LampatronicsShop("lampatronics", "Lampatronics", "https://lampatronics.com"),
  new WooShop("uge", "UGE", "https://uge-one.com"),
  new WooShop("ampere", "Ampere Electronics", "https://ampere-electronics.com"),
];
export const SHOPS_BY_KEY = Object.fromEntries(SHOPS.map((s) => [s.key, s]));

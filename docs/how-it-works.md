# How it works

The whole app runs in your browser. It's a static site on GitHub Pages, with no server of its own.

The catch: browsers only let a website read another site's data if that site allows it (CORS). The two Shopify shops, El Gammal, MTM, VoltX and Electra's catalog do; the other eleven don't. For those, requests go through a tiny **relay** on Cloudflare Workers that fetches the shop's page and hands it back.

```
                                ┌──────────── direct ────────────► Future, DevBoards, El Gammal,
 GitHub Pages site ─────────────┤                                  MTM, VoltX, Electra's catalog  (CORS allowed)
 (all search logic, in JS)      └─► Cloudflare Worker relay ─────► RAM, Makers, Micro Ohm, Most,
                                    (allow-listed shops only,      UGE, Ampere, Lampatronics,
                                     1-hour cache)                 Free, HD, Circuit, Mechatronx,
                                                                   Electra's stock
```

1. **Fan out.** A search runs against all shops in parallel, and the results show as they come in: once three shops have answered with a match, then each shop as it answers. Each shop gets 25 seconds; a slow or broken shop is marked failed instead of holding up the rest. You can also stop waiting early: the shops still running are marked skipped, and each can be fetched on its own afterwards. A search at one shop works the same way, with every other shop skipped from the start.
2. **Widen the net.** Shop search engines match text literally, and WooCommerce matches several words as one phrase, so the app also sends variants: `12 V 2 A` → `12v 2a`, `Mini-360 buck converter` → `mini360`, `mini 360` → `mini-360`, `XKC-Y25-NPN level sensor` → `xkc-y25`, `power supply with barrel jack` → `power supply`, `LM7805` → `7805`, `16x2 LCD` → `1602 LCD`. Variants only widen what the shops return; scoring still decides what matches.
3. **Score.** Every product name is scored 0–100 against your query (see below). Scores of 70+ are shown as matches, 45–69 as weaker matches, and anything lower is dropped.
4. **Filter and sort.** Out-of-stock and zero-price items are removed, and results are sorted by score, then price.
5. **Cache.** Results are kept for an hour (2 minutes if any shop failed). A search with skipped shops isn't cached until every skipped shop has been fetched, so searching again asks all of them. Pressing Search again for the search already shown asks the shops again too. The relay also caches shop responses for an hour, shared across everyone who uses the site, so a price can be up to about two hours old. Starting a new search stops the one it replaces.

## The relay

[`worker/src/index.js`](../worker/src/index.js) is about 140 lines and deliberately dumb: all parsing and matching happen in the browser. It:

- only fetches from the shop domains it knows, redirects included, so it can't be used as an open proxy
- only answers requests from the site's own origin (plus `localhost` for development)
- forwards just three headers (`x-api-key`, `content-type`, `accept`) and caps request bodies
- caches successful shop responses for an hour at Cloudflare's edge; errors aren't cached
- can return just the first bytes of a response (`bytes=`), so a stock check on a 350 KB product page sends the browser 24 KB

## Matching

Matching is what makes the results trustworthy, so it gets its own module ([`src/js/matching.js`](../src/js/matching.js)):

| Rule | Example |
|---|---|
| Part numbers match their core | `LM7805` matches `L7805CV` |
| Values and part numbers must match | `10k resistor` does **not** match `910K` or `110 KOHM`, and `4.7k` doesn't match `47K` |
| Words match whole | `male header` doesn't match "Female Header" |
| Plurals and suffixes match | `resistor` matches `Resistors`; `esp32` matches `ESP32-S3` |
| Units and symbols are normalized | `Ω` → `ohm`, `µ` → `u`, `×` → `x` |
| Values keep their units | `12 V` is `12v`, `250 mA` is `0.25A` and `220.0 ohm` is `220 ohm`, so `3.3V regulator` doesn't match a 3.3 ohm resistor, and `fuse 250mA` doesn't match a 2A 250V fuse |
| Makers' names are optional | `Omron Power Relay G2R-2 12VDC` matches `RELAY G2R-2-12VDC`; a name without the maker isn't counted as a worse match |
| Common aliases | `16x2` ↔ `1602`, `20x4` ↔ `2004`, `12864` → `128x64` |
| Accessories rank lower | "Acrylic case **for** Arduino UNO" is a weaker match for `Arduino UNO`, and "ESP32 **breakout** board" scores below the ESP32 itself, unless the search is for the accessory: `fuse holder T5x20` matches "Fuse Holder on PCB **for** T5x20" |
| Pack sizes are detected | "(10pcs)", "Pack of 5", "20 Pieces"; a kit ("Resistor Kit 600pcs") counts as one |

In a parts list, the default pick for each line is the **cheapest product within 25 points of that line's best match**. That keeps `L7805CV` as an option for `LM7805`, but stops a cheap accessory from winning on price. Shop totals use the same rule, so the "cheapest mix" and "one shop" figures are always comparable.

## Per-shop details

- **WooCommerce:** `GET /wp-json/wc/store/v1/products?search=…&stock_status[]=instock`, up to 60 results per query. Prices arrive in piasters and are converted to EGP.
- **Shopify:** the suggest endpoint caps at 10 results, so the app loads the whole catalog from `products.json` (about 1,300 products, under 1 MB compressed), keeps it for an hour, and searches it locally. Loading starts as soon as you start typing a search or a list, so the first search is fast.
- **Odoo (RAM):** parses up to 3 pages of `/shop?search=…`, then calls `get_combination_info` per product for the stock count. RAM slows down under load, so it gets at most 5 requests at a time, and stock lookups are cached for an hour.
- **El Gammal (Supabase):** the storefront reads products straight from its Supabase database with a public, read-only "anon" key, and so does this app: the same product filters as the shop's own search page, then the shop's `get_online_stock` function per matching product (at most 6 at a time, cached for an hour). The internal code at the start of product names ("XX629-") is dropped. If the shop ever changes that key, it shows as `failed` until the key in `src/js/shops.js` is updated.
- **Electra:** the store's own search only matches exact-case substrings, so the app downloads its catalog from `/api/v1/products` (about 5,300 products in 6 pages, allowed directly), keeps it for an hour and searches it locally. The API's stock count means nothing, so the product pages of the 20 best matches are read for their schema.org offer (price and availability), through the relay, which sends back only the page's first 24 KB. Offers are cached for an hour.
- **MTM:** the backend hands out the whole catalog in one request (`/backend/public/api/products`, about 3 MB, allowed directly), so the app keeps it for an hour and searches it locally. Products without a price are left out.
- **VoltX:** the storefront's own search API (`/api/products/search/public`) returns name, price, offer and stock in one response and allows browsers directly, so a search is a single request with no relay.
- **Mechatronx:** the storefront's product API (`/api/products?search=…`, through the relay) returns up to 100 products with price, offer and stock. A product with options, like a resistor sold in 88 values, comes back as one entry without stock of its own, so for the first 5 of those the app reads the product (`/api/products/<slug>`) for its options, each with its own price and stock, named after the product and its value ("Resistor 1/4W (1Pcs) — 10k Ohm"). Options are kept for an hour.
- **Lampatronics:** the storefront is a JavaScript app backed by `/api/frontend/product`. The API requires the key the site embeds in every page. The app reads that key from the home page and re-reads it if it's ever rejected. Up to 3 pages of 50 results.

---

More: [using the site](guide.md) · [development](development.md) · [the MCP server](../mcp/README.md)

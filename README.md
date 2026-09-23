<div align="center">

<img src="src/public/icon.png" alt="" width="64" height="64">

# Egypt Electronics Parts Search + MCP

**One search box for Egypt's electronic-parts shops.**<br>
Find a part, see every in-stock price side by side, and price a whole parts list in seconds.

### [**→ Open the site**](https://parts.ahmedshaalan.com/)

`17 shops` · `live prices` · `out-of-stock hidden` · `works on your phone` · `free, no sign-up` · [`MCP for AI assistants`](mcp/README.md) · [`AGPL-3.0 license`](LICENSE)

<img src=".github/screenshots/search.png" alt="Search results for Arduino Uno: 66 matches at 16 shops, best match first, with every shop and its match count on the side" width="760">

</div>

---

## Why

Buying parts in Egypt means opening RAM, Makers, Future, UGE and half a dozen other tabs, typing the same part number into each one, and hoping it's actually in stock. Every shop names the same part differently (`LM7805`, `L7805CV`, `7805 Regulator`), and their own search boxes rarely treat them as the same thing.

Egypt Electronics Parts Search asks every shop at once, recognizes those names as the same part, and gives you one clean list with in-stock items only.

## Features

**🔍 Search every shop at once**
- Queries all 17 shops at the same time; results fill in as the shops answer
- Or search one shop: pick it in the search box, then tick other shops to search them too
- The same product at different shops is one card, cheapest first, with every shop's offer inside (or see every offer in one list)
- Hides out-of-stock items automatically, and shows sale prices and the per-piece price for packs ("(10pcs)")
- Sort by best match, cheapest, or cheapest per piece; tick shops on or off, or show only sale items or ones you can add to cart from here
- Weaker matches are kept apart, each saying why it's probably a different part
- A shop that failed, timed out or was skipped says so, and can be asked again with one click

**🤖 Ask your AI assistant**
- An [MCP server](mcp/README.md) lets Claude or another AI assistant search the shops, price a parts list and re-check a price for you
- Runs on your own computer with the same matching as the site: no account, key or fee

**📋 Price a whole parts list**
- Type or paste parts, one per line; each joins the top of the list and is priced at every shop as it's added. Change a quantity, a part or its product right in the row
- Choose how to buy: **Best overall** (parts plus delivery), **Cheapest parts, any shop** or **Fewest shops**, or **Your picks** once you pick a product yourself. When a part is at a pricier shop to save a delivery, its offers say so
- Delivery counts: set a fee per shop, or one for any shop, so an extra shop is only used when it saves more than its delivery
- Counts packs: 20 resistors sold in 2-packs = 10 packs
- Every offer for a part is a click away, with its picture, shop, pack and cost for your quantity; look-alikes are kept apart and never picked for you

**🛒 Add to the shop's cart**
- Put a search result straight into its shop's cart, in a new tab that opens on the cart
- From a parts list, fill each shop's cart with what the order has there, quantities included; for shops whose cart can't be filled from here, copy the order as a message for their WhatsApp or order form
- Works at the 10 Shopify and WooCommerce shops (Future, DevBoards, Makers, Micro Ohm, Most, UGE, Ampere, Free, HD and Circuit); checkout stays on the shop's own site

**⭐ Save and track**
- Star any product to save it. **Update prices** re-checks every starred item at its shop and shows what went ▲ up, ▼ down, or out of stock, with a link to find it elsewhere
- Name and save a parts list, switch between saved lists, and reopen one later with fresh prices, or build one up from search results. It remembers the products you picked
- Saved items stay private in your own browser, with no accounts; **Back up** saves them and your delivery fees to a file, and **Restore** brings them back

**📱 Works anywhere**
- A plain website: open it on your laptop or phone, nothing to install
- Follows your system's light or dark mode
- The **Shops** tab lists every shop covered and which ones take Add to cart; **About** explains how a search runs, what's kept, what it can't do yet, and the terms of use

<table>
<tr>
<td width="62%"><img src=".github/screenshots/parts-list.png" alt="A seven-part list priced across shops: Best overall 983 EGP from 2 shops with delivery, against 1,037 EGP for the cheapest parts from 4 shops and 1,109 EGP from one shop, with the order in one basket per shop"></td>
<td width="38%"><img src=".github/screenshots/phone-dark.png" alt="ESP32 search results on a phone in dark mode"></td>
</tr>
<tr>
<td align="center"><sub>Parts list: how to buy, delivery counted</sub></td>
<td align="center"><sub>Phone, dark mode</sub></td>
</tr>
</table>

## Using it

Open **[parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/)**. On a phone, *Add to Home Screen* gives it an app icon. Type a part number or a description — `LM7805`, `ESP32`, `10k resistor` — or paste a whole parts list, one part per line, and every shop is asked at once.

Each tab, and what everything on it means, is in **[the guide](docs/guide.md)**.

## Supported shops

| Shop | Platform | How it's searched | Add to cart |
|---|---|---|---|
| [RAM Electronics](https://www.ram-e-shop.com) | Odoo | Search results page, plus a stock lookup per product | — |
| [Makers Electronics](https://makerselectronics.com) | WooCommerce | Store API | ✓ |
| [Future Electronics](https://store.fut-electronics.com) | Shopify | Full catalog, searched in the browser | ✓ |
| [Micro Ohm](https://microohm-eg.com) | WooCommerce | Store API | ✓ |
| [Most Electronic](https://mostelectronic.com) | WooCommerce | Store API | ✓ |
| [DevBoards Market](https://devboardsmarket.com) | Shopify | Full catalog, searched in the browser | ✓ |
| [Lampatronics](https://lampatronics.com) | Custom (Laravel + Vue) | The site's own product API | — |
| [UGE](https://uge-one.com) | WooCommerce | Store API | ✓ |
| [Ampere Electronics](https://ampere-electronics.com) | WooCommerce | Store API | ✓ |
| [El Gammal Electronics](https://el-gammal.com) | Supabase (Lovable) | The shop's public database API, plus a stock lookup per product | — |
| [Free Electronics](https://free-electronic.com) | WooCommerce | Store API | ✓ |
| [HD Electronics](https://hdelectronicseg.com) | WooCommerce | Store API | ✓ |
| [Circuit Electronics](https://circuit-electronics.com) | WooCommerce | Store API | ✓ |
| [Electra Store](https://electra.store) | Custom (Laravel) | Full catalog from the shop's API, searched in the browser, plus a stock lookup per product | — |
| [MTM Electronics](https://mtm-electronic.com) | Custom (Next.js + Laravel) | Full catalog from the shop's API, searched in the browser | — |
| [VoltX Electronics](https://voltx-store.com) | Custom (Next.js) | The shop's own public search API | — |
| [Mechatronx](https://mecha-tronx.com) | Custom (Laravel) | The shop's own product API, plus the options of products that have them | — |

**Add to cart** needs a shop whose cart a link can fill. The others only add to their cart from their own page (behind a security token, or with the cart kept in the browser), so for them the product link opens the page and the shop's own button is one click away.

## Docs

- **[Using the site](docs/guide.md)** — search, parts lists and saved items, tab by tab
- **[How it works](docs/how-it-works.md)** — the fan-out search, the relay, the matching rules, shop by shop
- **[The MCP server](mcp/README.md)** — giving Claude or another AI assistant the same search
- **[Development](docs/development.md)** — project structure, running your own copy, adding a shop, how commits are written
- **[Changelog](CHANGELOG.md)** — what changed, by date. Each version is a git tag

## Privacy

- **No accounts, no cookies.** Saved items and lists stay in your own browser.
- **Anonymous visit counts.** The site uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/), which counts page views without cookies or tracking individual visitors. What you search for isn't sent to it.
- **Carts are the shops' own.** Add to cart opens the shop's site, which keeps the cart (and its own cookies) the way it does when you shop there directly.
- **Searches go to the shops.** To get prices, your browser asks each shop directly, or through the relay for shops that need it. The relay's code doesn't store or log requests.

## Limitations

- **Matching is heuristic.** It handles part numbers well. Vague names like "LCD" or "sensor" need a glance at the pick, and some accessories still slip through as a strong match (for example, an I2C adapter board for `16x2 LCD`). Every parts-list row opens its offers for exactly this.
- **Delivery fees are your estimates.** The parts list counts the fees you set; shops don't publish them in a form the site can read, and a fee can depend on where you are and how much you order. Search results don't include delivery.
- **Add to cart works at 10 of the 17 shops**, and not for products with options to choose. Some products are only sold in multiples ("order in tens"); the cart then gets the next amount the shop accepts. Prices in the cart are the shop's current ones, which may have changed since the search.
- **Shops change.** A site redesign or platform switch can break its connector. The shop then shows as `failed` rather than returning wrong data.
- **A shop may block the relay.** Shops can refuse requests coming from Cloudflare's servers; that shop then shows as `failed`.
- **Only shops with a real online store are covered.** Shops that sell only through Facebook or WhatsApp can't be searched.
- **Saved items don't sync** between browsers or devices.

## Being a good citizen

This app reads the same public product data your browser does when you shop, and is built to go easy on the shops:

- The relay caches every shop response for an hour, shared by all visitors
- The catalogs searched in the browser (the Shopify shops, Electra and MTM) are fetched at most once an hour per visitor, and only once they start typing
- Starting a new search stops the requests of the one it replaces
- A parts list searches at most 4 parts at a time, and RAM, the slowest shop, gets at most 5 requests at once
- Saved-item refreshes check at most 6 items at a time
- The MCP server keeps the same limits and caches, per computer it runs on

If you run your own copy, please don't lower the cache times or raise the parallelism.

## Tech

JavaScript (ES modules) · [Preact](https://preactjs.com) · [Vite](https://vite.dev) · [GitHub Pages](https://pages.github.com) · [Cloudflare Workers](https://workers.cloudflare.com)

The search code in `src/js` (connectors, matching, totals) has no dependencies and runs unchanged in the browser and in the MCP server. Every tab is a Preact component, in its own folder under `src/js/ui/` with its own stylesheet.

## Feedback

Found a bug, a shop that stopped working, or a shop that should be added? [Open an issue](https://github.com/AhmedShaalan/Egypt-Electronics-Parts-Search/issues).

## Credits

App icon: [Transistor](https://icons8.com/icon/set/transistor/color) icon by [Icons8](https://icons8.com).

## License

Copyright © 2026 [Ahmed Shaalan](https://ahmedshaalan.com)

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later). In short:

- You can use, study, modify and share this project.
- <ins>If you share a modified version, **or run one as a website or service that others use**, you must release your full source code under the same license and keep the copyright notices.</ins>
- It comes with no warranty.

Shop names and product data belong to their respective shops. This project isn't affiliated with any of them.

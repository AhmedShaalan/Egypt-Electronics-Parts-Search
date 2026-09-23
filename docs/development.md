# Development

Everything here is about the repo: where the code lives, how to run it, how to add a shop and how changes are written down. For what the site does, see [using the site](guide.md) and [how it works](how-it-works.md).

## Project structure

```
Egypt-Electronics-Parts-Search/
├── src/                    The website, built by Vite and published to GitHub Pages
│   ├── index.html          The page's markup
│   ├── css/site.css        Styles, light and dark
│   ├── css/search.css      The Search tab's styles
│   ├── css/saved.css       The Saved tab's styles
│   ├── css/list.css        The Parts list tab's styles
│   ├── css/shops.css, ai.css, about.css  The Shops, AI and About tabs' styles
│   ├── css/components.css  Pieces more than one tab uses
│   ├── public/             Copied as they are
│   │   ├── icon.png, icon-96.png  App icon (Icons8), at 64 and 96 pixels
│   │   ├── avatar.jpg      My GitHub profile picture, for the About tab
│   │   ├── og-image.png    Link preview image
│   │   ├── robots.txt
│   │   ├── CNAME           The custom domain for GitHub Pages
│   │   └── google….html    Google Search Console verification
│   └── js/                 config, shops, matching and search are shared with mcp/, so they stay plain JS
│       ├── config.js       Relay URL, timeouts, cache times
│       ├── shops.js        One connector per platform + the SHOPS list
│       ├── matching.js     Query ↔ product-name scoring, aliases, pack sizes, why a match is weak
│       ├── grouping.js     Which results are the same product at different shops
│       ├── plans.js        Ways to buy a parts list: which product and shop for each part, delivery counted
│       ├── list-model.js   A parts list's rows and what's worked out from them, without the page
│       ├── search.js       Fan-out search, parts lists, saved items
│       ├── main.js         The page: tabs, start-up
│       ├── prerender.js    The Shops, AI and About tabs as HTML, for the build to write into the page
│       └── ui/             The page's parts
│           ├── search/, list/, saved/, shops/, ai/, about/  One folder per tab, in Preact
│           ├── components.jsx, icons.jsx, store.js, use-modal.js  What the tabs share
│           ├── saved.js    What's saved, for the star, the count and the Saved tab
│           ├── cart.js, add-to-list.js, copy.js
│           └── common.js, format.js, storage.js  Helpers they share
├── mcp/                    MCP server for AI assistants (Node, reuses src/js)
│   ├── server.js
│   └── README.md           How to set it up in an AI assistant
├── worker/                 Cloudflare Worker relay
│   ├── src/index.js
│   └── wrangler.toml       Worker name and allowed origins
├── package.json            The site's build: Vite + Preact
├── vite.config.js          The build; also writes the Shops, AI and About tabs into the page and dates the sitemap
├── .github/
│   ├── workflows/pages.yml Builds and publishes the site on every push to main
│   └── screenshots/        Images for the README
├── docs/                   The longer pages the README links to
│   ├── guide.md            Using the site, tab by tab
│   ├── how-it-works.md     The search, the relay, the matching
│   └── development.md      This page
├── CHANGELOG.md            What changed, by date
└── LICENSE                 GNU AGPL v3
```

## Run your own copy

Everything fits in the free tiers of GitHub Pages and Cloudflare Workers (100,000 relay requests a day).

**1. Fork this repo.**

**2. Deploy the relay.** You need [Node.js](https://nodejs.org) and a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

Set `ALLOWED_ORIGINS` in [`worker/wrangler.toml`](../worker/wrangler.toml) to your GitHub Pages origin, e.g. `https://yourname.github.io` (just the origin, no path). Then:

```sh
cd worker
npx wrangler login
npx wrangler deploy
```

Wrangler prints the relay's address, like `https://egypt-parts-relay.yourname.workers.dev`.

**3. Point the site at it.** Put that address in `PRODUCTION_RELAY` in [`src/js/config.js`](../src/js/config.js). Also point the links to the source at your fork: under the AGPL, visitors to your copy must be able to get its source. They're the GitHub icon and the footer's **Source on GitHub** in `src/index.html`, and the addresses at the top of `src/js/ui/about/about-app.jsx`, `src/js/ui/shops/shops-app.jsx` and `src/js/ui/ai/` (`ai-app.jsx`, `setup.jsx`). Replace `parts.ahmedshaalan.com` with your own address in `src/index.html` (the canonical link, the `og:` and `twitter:` tags and the structured data), the sitemap in `vite.config.js` and `src/public/robots.txt`, and delete `src/public/CNAME` and the Google verification file unless you use your own. Then commit and push.

**4. Turn on GitHub Pages.** In your fork: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. The included workflow ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)) builds the site and publishes it on every push to `main` that touches it. Run it once from the **Actions** tab (or push a change) and the site appears at `https://yourname.github.io/<repo-name>/` about a minute later.

## Local development

Needs Node 22 or newer. Run the relay and the site side by side:

```sh
# terminal 1: the relay on http://localhost:8787
cd worker && npx wrangler dev --var ALLOW_LOCALHOST:true

# terminal 2: the site on http://localhost:8766, reloading as you edit
npm install
npm run dev
```

Open <http://localhost:8766>. To check what GitHub Pages will get, `npm run build` puts it in `dist/` and `npm run preview` serves that. On `localhost`, the site automatically uses the local relay.

## Adding a shop

**If the shop runs WooCommerce, Shopify or Odoo**, add one line to `SHOPS` at the bottom of [`src/js/shops.js`](../src/js/shops.js):

```js
new WooShop("newshop", "New Shop", "https://newshop.com"),
```

WooCommerce and Odoo shops are always fetched through the relay, so also add the hostname to `SHOP_HOSTS` in [`worker/src/index.js`](../worker/src/index.js) and redeploy the relay. Shopify shops allow browsers directly and don't need it.

To check a WooCommerce shop first, this should return JSON:

```sh
curl "https://newshop.com/wp-json/wc/store/v1/products?search=7805&per_page=3"
```

For Shopify, try `https://newshop.com/products.json?limit=1`.

**If it's a different platform**, look for a JSON API behind the shop's own search box first (the browser's network tab shows it; VoltX and Lampatronics were added that way). Then extend `Shop` and implement two methods:

```js
class MyShop extends Shop {
  // Products for a query: { shop, ref, name, price, url, image, in_stock, old_price }.
  // Mark stock accurately; out-of-stock items are filtered out.
  async search(query, signal) {}

  // Current { price, in_stock } for a saved product (by the ref you set), or null if it's gone.
  async check(ref, signal) {}
}
```

`ref` is any string your connector can use to look the product up again, such as an ID, slug or handle.

## Commits

One change per commit, with a short subject and, when there's more to say, a few bullets:

```
feat(list): add delivery fees to totals

- one fee for any shop, plus your own per shop
- kept in the browser, included in Back up
```

The subject is `type(area): what changed`, under 60 characters, written as a command ("add", not "added").

- **Type:** `feat` (something new a visitor can do), `fix`, `style` (looks only), `refactor` (same behaviour), `docs`, `build`, `seo`, `chore`.
- **Area:** `search`, `list`, `saved`, `shops`, `ai`, `about`, `mcp`, `worker`, `matching`, `site`. Leave it out when the change spans the whole site.

What changed for visitors, in plain words, goes in [CHANGELOG.md](../CHANGELOG.md).

## Configuration

| Setting | Where | Default |
|---|---|---|
| Relay address | `PRODUCTION_RELAY` in `src/js/config.js` | the deployed Worker |
| Time allowed per shop | `SHOP_TIMEOUT_MS` in `src/js/config.js` | 25 s |
| Search cache | `CACHE_MS` / `PARTIAL_CACHE_MS` in `src/js/config.js` | 1 h / 2 min |
| Max lines in a parts list | `MAX_LIST_LINES` in `src/js/config.js` | 40 |
| Match thresholds | `STRONG` / `WEAK` in `src/js/matching.js` | 70 / 45 |
| Aliases | `ALIASES` in `src/js/matching.js` | 16x2 ↔ 1602, … |
| Sites allowed to use the relay | `ALLOWED_ORIGINS` in `worker/wrangler.toml` | parts.ahmedshaalan.com and the GitHub Pages origin |
| Allow `localhost` too | `ALLOW_LOCALHOST` in `worker/wrangler.toml` | off (turned on by `wrangler dev --var ALLOW_LOCALHOST:true`) |
| Relay cache | `CACHE_SECONDS` in `worker/src/index.js` | 1 h |

---

More: [using the site](guide.md) · [how it works](how-it-works.md) · [the MCP server](../mcp/README.md)

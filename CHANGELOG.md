# Changelog

What changed on [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/), newest first. The site is updated as changes land. Each entry is also a git tag (`v1.5.0`), which is the version to use if you run the [MCP server](mcp/) or your own copy.

## 1.5.0 · 2026-09-21

### Added
- **Add to cart** at the 10 Shopify and WooCommerce shops. A search result's cart button puts it into the shop's cart, in a new tab that opens on the cart.
- From a parts list: a button per shop puts your picks (the cheapest mix, or the ones you chose) into that shop's cart, and each row of **Total by shop** has an **Add** button for everything that shop has from the list. Quantities come along, counting packs and any "sold in tens" rule; a WooCommerce shop's products are added one after another in the same tab.

### Changed
- On a computer, a result's price sits at the right, and its buttons show above it on hover. On a phone they sit under the price.
- Smaller product pictures on phones.

## 1.4.0 · 2026-09-21

### Changed
- Search results show as the shops answer, instead of after the slowest one. They appear once three shops have answered with a match, then each shop is added as it answers; its chip shows `· …` until then. **stop** skips the shops still running.

## 1.3.1 · 2026-09-21

### Changed
- The About text points to the Shops tab instead of listing all 16 shops.

### Fixed
- After an update the page could come up blank until a hard refresh, because the browser mixed the new page with its cached old scripts. Every update now loads a fresh set of scripts, and the search tab shows even if they fail.

## 1.3.0 · 2026-09-21

### Added
- An MCP server in `mcp/`: Claude and other AI assistants can search the shops, price a parts list and re-check a price, from your own computer. The new **AI** tab explains how to set it up.
- Hover a search result to copy it (name, price, shop, link), add it to a parts list, or save it. The buttons are always shown on phones, and a saved result keeps its filled star.
- Add to list: pick one of your saved parts lists or name a new one. Adding the same part again raises its quantity.
- The Saved tab count includes saved parts lists, not only starred items.
- A back-to-top button, and a clear (×) button in the search box that also clears the results.
- Search progress: a progress bar counts the shops as they answer, and **Show results so far** stops waiting for slow shops. A skipped shop can be searched on its own later from its chip.
- Parts lists written as a spec sheet work: `- 1 relay DPDT, 12 V coil (HK19F class)` is read as one `relay DPDT`, and a count in front (`2 Mini-360 buck converter`) is the quantity.

### Changed
- Better matching:
  - A maker's name is optional: `Omron Power Relay G2R-2 12VDC` finds `RELAY G2R-2-12VDC`, and `Vishay 1N4007` finds every 1N4007.
  - Searching for an accessory finds it: `fuse holder T5x20` matches "Fuse Holder for T5x20".
  - Values must match exactly: `100nF` no longer matches 100 pF or 100 V capacitors, `220 ohm` no longer matches 220 kΩ, and `250mA` matches `0.25A` but not a 2 A 250 V fuse.
  - Searches reach more of each shop's stock: model numbers are also searched on their own (`Mini360`, `XKC-Y25`), and `12 V` is searched as `12v` the way shops write it.
- The loading spinner is gone; the progress bar replaces it.
- The link preview image shows the current address and all 16 shops.
- The shop chips under the search box are in A–Z order.
- The large shop catalogs (a few MB) download once you start typing, not on every visit, and matching them is about 8× faster.
- The Saved total counts only items that are in stock.
- On phones the tabs stay on one line, down to the smallest screens.

### Fixed
- Decimal values no longer match ten times the value: `4.7k` doesn't match 47K, `1.5A fuse` doesn't match 15 A, `22pF` doesn't match 2.2 pF.
- A word no longer matches inside another: `male header` doesn't match "Female Header".
- Parts lists: `Resistor, 10k` keeps its value, `16 x 2 LCD` is one LCD and not 16, and a list over 40 lines says how many lines were left out.
- Add to list: a product whose name ends in a pack size ("… 40pcs") or starts with `#` is added as itself, with the right quantity.
- Clicking **Fetch now** on several skipped shops at once keeps all of their results.
- A new search stops the one it replaces, and repeating a search that is still running keeps its progress bar moving.
- Opening a saved list while another list is being priced no longer mixes up the results.
- Refreshing saved prices no longer loses items saved or removed meanwhile; VoltX kits can be re-checked, and removed VoltX products show as no longer listed.
- A failed shop's chip shows why it failed when clicked, menus work with the keyboard (arrows, Escape), screen readers hear when results arrive, and the saved star is easier to see in light mode.
- Shop links that aren't web addresses are never made clickable.
- The relay no longer tells browsers to keep shop errors for an hour, and follows redirects only to the shops it knows.

## 1.2.0 · 2026-09-20

### Added
- Three shops: Electra Store, MTM Electronics and VoltX Electronics (16 in total).

## 1.1.0 · 2026-09-19

### Added
- Three shops: Free Electronics, HD Electronics and Circuit Electronics.
- Searches are in the address bar (`?q=`), so a search can be shared as a link.
- Copy menus on the Saved tab, rename, copy and delete for saved lists, and a totals bar.
- About text, a FAQ and a sitemap for search engines.

### Changed
- The site moved to parts.ahmedshaalan.com.
- Makers Electronics images load faster, through their image CDN.

## 1.0.0 · 2026-09-17

### Added
- First release: search RAM Electronics, Makers Electronics, Future Electronics, Micro Ohm, Most Electronic, DevBoards Market, Lampatronics, UGE and Ampere Electronics at once, with in-stock results only.
- Price a whole parts list: the cheapest mix across shops, the best single shop, and every shop's total.
- Save products and lists in the browser, and refresh saved prices.
- El Gammal Electronics.
- A Shops tab, filtering results by shop, and a light/dark theme toggle.

### Changed
- Licensed under AGPL-3.0-or-later (was MIT).

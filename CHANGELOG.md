# Changelog

What changed on [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/), newest first. The site is updated as changes land. Each entry is also a git tag (`v1.8.0`), which is the version to use if you run the [MCP server](mcp/) or your own copy.

## Unreleased

### Added
- Search results are grouped by product: the same part at different shops is one card, cheapest first, with every shop's offer inside. Only close matches are merged (the package, values like 5V or 1/4W, model codes like S3 or 30-pin, and the pack size must agree, and prices far apart stay apart); anything unsure stays on its own. "Every offer" shows the flat list.
- Shops on the side: tick shops on or off with their match counts, or show only one. A shop that failed or was skipped says so there and can be asked again.
- Weaker matches say why they're probably a different part: the part number or word missing from the name, or that it's an accessory made for the part.
- Recent searches on the empty search page, "/" to jump to the search box, and a one-click "Add to ‹list›" for the list you added to last.
- Saved has two tabs, Starred items and Parts lists, and opens on the one used last.
- Starred items show how their price moved since they were starred, filter by cheaper, pricier or can't buy, and sort by newest, biggest drop, shop or price. An item out of stock or no longer listed has a "Find elsewhere" link that searches every shop for it. Tick several to see what they cost together, add them to a parts list in one go, copy or remove them.
- Parts lists are cards with their first parts, their total and from how many shops, and a note when parts were added since they were priced. "Update prices" prices one list or all of them again and shows how each total moved. Lists can be duplicated, and a new one started from there.
- Back up and Restore save everything to a file and bring it back, for a browser whose data gets cleared.
- Remove and Delete have Undo instead of a confirmation box, and Rename is a small dialog instead of the browser's prompt.
- Parts list: choose how to buy. Best overall (parts plus delivery), Lowest parts cost or Fewest shops, and Custom once you choose a product yourself. Each row says why it's at that shop when a cheaper one exists ("Saves a delivery", "Look-alike skipped"), and rows the plan moves to another shop light up.
- Parts list: delivery fees, one for any shop and your own figure for the shops you know, kept in the browser and counted in every total.
- Parts list: the order as one basket per shop, with "Fill cart at …" or, for shops whose cart can't be filled from here, "Copy as message" for their WhatsApp or order form.
- Parts list: the list has a name and says when it has unsaved changes; "My lists" switches between saved lists, starts a new one or copies it as text. The list on the tab is kept when the page is reloaded.

### Changed
- The Search tab is redesigned: the search bar sticks to the top once there are results, one status line shows how many shops have answered (with Stop waiting, Try again and Copy link), and each result has a cart button (where the shop allows it), a star and a ⋯ menu instead of four buttons on hover.
- The about text and common questions move to a footer at the bottom of every tab.
- Starred items no longer add up to a total: they aren't an order. Ticking some shows what those cost.
- The Parts list tab is redesigned: the list is the page. Parts typed or pasted in join it as rows, each priced as it's added, and quantities, parts and products are changed in the row, so there's no Find prices step. Every offer for a part opens in its row, with weaker matches below a line saying why. The "Everything from one shop" card and the "Total by shop" table give way to Fewest shops and the baskets.
- A saved parts list's total includes delivery, and the list remembers the products you chose.
- The site is now built with [Vite](https://vite.dev) before it's published, and the Search, Parts list, Saved and Shops tabs are [Preact](https://preactjs.com) components. It loads as one script and one stylesheet, whose names change with every release so browsers never keep an old copy.

## 1.8.0 · 2026-09-21

### Fixed
- Password managers no longer offer saved logins in the search box, the picker's filter or the list-name fields.

### Changed
- The page's code is split into files: the styles in `src/css/site.css`, and each tab and part of the page in its own module under `src/js/ui/`. The site looks and works the same.

## 1.7.0 · 2026-09-21

### Added
- Change a part in a priced list: the ✎ next to a line opens a box to search for another name or change the quantity. Only that line is priced again, with the cheapest close match picked, and the pasted list gets the same edit.
- Saved lists can be updated: a list opened from Saved shows its name, and after a change **Save changes** saves over it, or **Save as new list** keeps the original.
- Saved lists remember the products you picked instead of the cheapest, and pick them again when opened. A pick that's sold out or gone falls back to the cheapest, with a note on the line.

### Changed
- The quantity box has the same style as the other fields.

## 1.6.0 · 2026-09-21

### Added
- Each parts-list line has its own cart button, next to a ↗ link to the product. For a shop whose cart can't be filled from here, the cart is faded and a tooltip says so.

### Changed
- A parts-list line shows its product as a card (picture, name, shop, price), and changing it opens a proper picker instead of a plain dropdown: a box to filter by name or shop, close matches first, each option with its picture, shop, pack size and cost for your quantity, and the cheapest tagged. It works with the arrow keys and Enter.
- A little more room under the note about shops whose cart can't be filled from here.
- New screenshots in the README.

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

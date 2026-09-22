# Changelog

What changed on [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/), newest first. The site is updated as changes land. Each entry is also a git tag (`v2.0.0`), which is the version to use if you run the [MCP server](mcp/) or your own copy.

## 2.0.0 · 2026-09-22

### Added
- Parts list: "Copy all" on the order copies every shop's order as one message, with what the parts come to.
- Search one shop: pick it in the search box. The other shops are listed as not searched, and ticking one searches it too. The link it makes opens the same search.
- A shop: Mechatronx (17 in total). Products it sells in several values, like a resistor in 88 values, are searched one value at a time, so "10k resistor" finds the 10k one in stock.
- Search results can be grouped by product: with "By product", the same part at different shops is one card, cheapest first, with every shop's offer inside. Only close matches are merged (the package, values like 5V or 1/4W, model codes like S3 or 30-pin, and the pack size must agree, and prices far apart stay apart); anything unsure stays on its own. "Every offer", the list of every shop's offers, is still the default.
- Shops on the side: tick shops on or off with their match counts, or show only one. A shop that failed or was skipped says so there and can be asked again. Below them, show only what's on sale or what can go in the cart from here. On a phone, all of this opens from a Filters button.
- Weaker matches say why they're probably a different part: the part number or word missing from the name, or that it's an accessory made for the part.
- A search with no in-stock match suggests searching the part number alone, and says when there are weaker matches below.
- Recent searches on the empty search page (or examples to try before there are any), "/" to jump to the search box, and a one-click "Add to ‹list›" for the list you added to last.
- Saved has two tabs, Starred items and Parts lists, and opens on the one used last.
- Starred items show how their price moved since they were starred, filter by cheaper, pricier or can't buy, and sort by newest, biggest drop, shop or price. An item out of stock or no longer listed has a "Find elsewhere" link that searches every shop for it. Tick several to see what they cost together, add them to a parts list in one go, copy or remove them. Items starred from now on have a cart button, like in the search results, at the shops that allow it. Update prices shows how far it's got, then what changed.
- Parts lists are cards with their first parts, their total and from how many shops, and a note when parts were added since they were priced. "Update prices" prices one list or all of them again and shows how each total moved. Lists can be duplicated, and a new one started from there.
- Back up and Restore save starred items, parts lists and delivery fees to a file and bring them back, for a browser whose data gets cleared. Fees already set in the browser restored to are kept.
- Remove and Delete have Undo instead of a confirmation box, and Rename is a small dialog instead of the browser's prompt.
- Parts list: choose how to buy. Best overall (parts plus delivery), Cheapest parts, any shop, or Fewest shops, and Your picks once you choose a product yourself. When a part is at a pricier shop to save a delivery, its offers say so, and rows the plan moves to another shop light up.
- Parts list: delivery fees, one for any shop and your own figure for the shops you know, kept in the browser and counted in every total.
- Parts list: the order as one basket per shop, with "Fill cart at …" or, for shops whose cart can't be filled from here, "Copy as message" for their WhatsApp or order form.
- Parts list: the list has a name and says when it has unsaved changes; "My lists" switches between saved lists, starts a new one or copies it as text. Quantities have + and − buttons, a removed row has Undo, and a shop that didn't answer can be asked again for every part at once. The list on the tab is kept when the page is reloaded. Leaving the tab or closing the page with unsaved changes asks first.
- An About tab: why the site exists, how a search runs, what's kept and counted, what it can't do yet, common questions, short terms of use and credits.
- Shops: find a shop by name, and show only those whose cart can be filled from here.
- AI: the setup steps change to match the app (Claude Code, Claude Desktop, Cursor or another) and the computer picked, with a check after each step, questions to try, fixes for the usual problems, and how to update or remove it.
- The site's name at the top goes back to the Search tab.

### Changed
- A shop's order copied as a message is headed by the shop's name, underlined, so it still says where it's from when pasted elsewhere. It ends with the parts, the delivery estimate and the total, the same total as the shop's on the page.
- A product you picked for a part stays picked when a saved list is opened again. If the search no longer finds it, its shop is asked: one still for sale stays your pick, even if the shop renamed it, and one out of stock or no longer sold is shown on its row as **Out of stock** or **No longer sold**, not counted in the total, with **Choose another**. When its shop didn't answer, the row says **Couldn't check**, and **Try again** brings the pick back once the shop answers. Before, the row said "Your pick is gone" and quietly bought something else. Saved lists now keep the picked products' names, prices and links for this.
- The Search tab is redesigned: the search bar sticks to the top once there are results, one status line shows how many shops have answered (with Stop waiting, Try again and Copy link), and each result has a cart button (where the shop allows it), a star and a ⋯ menu instead of four buttons on hover.
- The about text and common questions move to the About tab. The footer keeps links to the terms of use, privacy and the source, and stays at the bottom of the window when a tab is short.
- Starred items no longer add up to a total: they aren't an order. Ticking some shows what those cost.
- The Parts list tab is redesigned: the list is the page. Parts typed or pasted in join it as rows at the top, each priced as it's added, and quantities, parts and products are changed in the row, so there's no Find prices step. Change part only changes the name now; the quantity is set in the row. Every offer for a part opens in its row, with weaker matches below a line saying why. The "Everything from one shop" card and the "Total by shop" table give way to Fewest shops and the baskets.
- Parts added to a saved list from a search result or from Saved go at its top, like on the Parts list tab.
- A saved parts list's total includes delivery, and the list remembers the products you chose.
- The link preview image, shown when the site's address is shared, shows the redesigned search.
- The Shops, AI and About tabs are part of the page as it's sent, so search engines and link readers that don't run scripts read them too. The page also tells search engines the site's name, and gives them a larger icon to show beside it in their results.
- The site is now built with [Vite](https://vite.dev) before it's published, and every tab is a [Preact](https://preactjs.com) component, each in its own folder with its own styles. It loads as one script and one stylesheet, whose names change with every release so browsers never keep an old copy.

### Fixed
- A product added to a parts list from Search or Saved is that line's pick, so the list prices that exact product. Before, the list searched its name again and could pick another shop's.
- A part number's digits no longer match the same digits in a measurement: TIP120 isn't a 120 ohm resistor or a 120 W power supply, IRF530N isn't a 530 nm LED, and Mini360 isn't a 360 W supply.
- A diode's number (1N5401) no longer matches a transistor with the same digits under other letters (MMBT5401). IN5401 and LL4148 still count as 1N parts.
- A search for a fixed resistor ("10k resistor") no longer takes a potentiometer or trimmer of that value as a match; it's shown among the weaker matches as "A potentiometer, not a fixed resistor".
- A holder, clip, case or bracket for a part is no longer counted as the part itself: "9V battery" no longer matches a 9V battery clip or holder. A board sold "without cable" is no longer taken for a cable.
- A search with a bare number and words, like "5010 fan", also asks the shops for the number alone, so it finds "5010 Cooling Fan" at shops whose search wants the words together. Before, it found nothing while "5010" alone found the fans.
- A product whose name gives its wire count, like a "3-wire" fan, is no longer taken for a wire and marked as an accessory.
- A search for a 1N part (a diode, like 1N5401) no longer matches the 2N part with the same number (a transistor, 2N5401), and the other way round. The same goes for any part number that starts with digits and letters. The MCP server matches the same way.
- A model written with a space or joined up ("mini 360", "Mini360") finds the shops that only list it with a dash ("Mini-360"), so it gets the same results as "mini-360". The MCP server searches the same way.
- While the Parts list is still pricing, its total says so underneath with a spinner and a progress bar ("Pricing 7 of 19 parts…", then "Almost done" while a shop is still to answer), and stays grey until it's final. It lights up once when it is. The total in the bar at the bottom of a phone's screen says so too.
- On the Parts list, a part shows its prices once all but the slowest three shops have answered, and the next part starts. The slow shops are added as they answer, and the part says under it which it's still waiting for. A shop taking its time no longer holds up the whole list.
- A part added from Search or Saved to the list open on the Parts list tab shows up there too, instead of only in the saved copy, where saving the tab would have dropped it. After adding a result to a list, the other results offer "Add to ‹list›" straight away.
- Pressing Search again for what's already shown, however it's written, asks the shops again instead of showing the same results.

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

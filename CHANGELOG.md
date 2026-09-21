# Changelog

What changed on [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/), newest first. The site is updated as changes land, so entries are grouped by date rather than by version.

## 2026-09-21

### Added
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

## 2026-09-20

### Added
- Three shops: Electra Store, MTM Electronics and VoltX Electronics (16 in total).

## 2026-09-19

### Added
- Three shops: Free Electronics, HD Electronics and Circuit Electronics.
- Searches are in the address bar (`?q=`), so a search can be shared as a link.
- Copy menus on the Saved tab, rename, copy and delete for saved lists, and a totals bar.
- About text, a FAQ and a sitemap for search engines.

### Changed
- The site moved to parts.ahmedshaalan.com.
- Makers Electronics images load faster, through their image CDN.

## 2026-09-17

### Added
- First release: search RAM Electronics, Makers Electronics, Future Electronics, Micro Ohm, Most Electronic, DevBoards Market, Lampatronics, UGE and Ampere Electronics at once, with in-stock results only.
- Price a whole parts list: the cheapest mix across shops, the best single shop, and every shop's total.
- Save products and lists in the browser, and refresh saved prices.
- El Gammal Electronics.
- A Shops tab, filtering results by shop, and a light/dark theme toggle.

### Changed
- Licensed under AGPL-3.0-or-later (was MIT).

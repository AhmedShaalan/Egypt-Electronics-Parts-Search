# Using the site

Open **[parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/)**. On a phone, *Add to Home Screen* gives it an app icon.

## Search

Type a part number or a description: `LM7805`, `ESP32`, `10k resistor`, `HC-SR04`. Exact part numbers give the sharpest results. Press `/` from anywhere on the tab to jump to the box; your recent searches wait under it.

| You'll see | What it means |
|---|---|
| **Searching 17 shops… 9 answered** | Results show once a few shops have answered with a match, and the rest join as they answer. **Stop waiting** skips the shops still running |
| **Every offer** or **By product** | Every offer, the default, lists each shop's offer on its own. By product puts the same product at different shops in one card, with the cheapest shop and price, then the next few; open it for every shop's offer. Only close matches are merged (the package, values like 5V, model codes like S3 or 30-pin and the pack size must agree); anything unsure has its own card |
| The shop picker in the search box | **All shops**, or one shop to search only there. The others are listed as **Not searched**; tick one to search it too, or **Search them too** for all of them. The link it makes (`?shop=`) opens the same search |
| The **Shops** panel | Each shop's number of matches. Untick a shop to hide it, or **Only** to see just that one. Shops still searching spin; a shop that **didn't answer** or was **skipped** has **Try again** or **Search now** |
| **Sale** | The shop is discounting it; the original price is struck through |
| `pack of 10 · 0.50 EGP each` | The listing is a pack; this is the price per piece |
| **N weaker matches** | Loosely related items, folded at the bottom, each saying why it's probably a different part: the part number missing from its name, or that it's an accessory made for it |
| Cart, ☆ and ⋯ | The cart puts it into the shop's cart in a new tab (only for [shops that allow it](../README.md#supported-shops)); ☆ saves it; ⋯ opens it, adds it to a parts list (in one click to the list you added to last) or copies it |
| **Copy link** | A link that opens these results |

## Parts list

The list is the page: type or paste parts in the **Add parts** box (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> adds them) and each becomes a row at the top of the list, in the order you wrote them, priced at every shop as it's added. All of these quantity formats work:

```
LM7805 x2
2x ESP32
10k resistor 20pcs
100nf capacitor, 5
- 1N4007 diode x10
- 2 Mini-360 buck converter
- 1 relay DPDT, 12 V coil (HK19F class)
HC-SR04
16x2 LCD
```

Bullets and numbering are ignored, `#` lines are treated as comments, and names like `16x2 LCD`, `16 x 2 LCD`, `12 V relay`, `4 channel relay` or `555 timer` aren't mistaken for a quantity. Lists written as a spec sheet work too: notes after a comma or in brackets are left out of the search, so the line above is searched as `relay DPDT`. A single word or value after a comma stays: `Resistor, 10k, 1/4W` is searched as `Resistor 10k 1/4W`. A part already on the list gets the quantity added. Up to 40 parts per list.

| You'll see | What it means |
|---|---|
| A row | The part, its quantity (type it or use + and −), what it costs, and the product it would be bought as, with its shop. Click the product to see every offer: sorted by the cost for your quantity, with a box to filter by name or shop, and weaker matches below a line with why they're probably a different part. Choose one to buy that instead. When the plan buys it at a pricier shop to save a delivery, a line above the offers says so |
| **Check match** / **Not found** | Only weaker matches were found, so nothing is bought for it until you choose one; or no shop has it in stock |
| ⋯ | **Change part** searches for another name, for that row only; if no shop has the new name, the box stays open to try another. Also opens the product at its shop, or removes the row (with **Undo**) |
| **How to buy** | **Best overall** is the lowest parts cost plus delivery; **Cheapest parts, any shop** takes the cheapest product for each part wherever it is, so its delivery to more shops can make it cost more in all; **Fewest shops** means the fewest deliveries. Choosing a product yourself makes it **Your picks**: the plan you were on, with your picks. The rows follow the choice, and when a change moves other parts to another shop, they light up and a message says so |
| **Delivery fees** | One estimate for any shop, and your own figure for the shops you know. They're kept in this browser and apply to every list |
| **Your order** | One basket per shop with what goes in it. **Fill cart at …** opens the shop with them in its cart, quantities set (counting packs); a Shopify shop takes them all at once, a WooCommerce shop one per link, so the tab adds them one after another and ends on the cart. Products with options to choose (a size, a colour) are added on the shop's page. For a shop whose cart can't be filled from here, open each part from the basket, or **Copy as message** for their WhatsApp or order form |
| **Prices from 16 of 17 shops** | A shop didn't answer; **Try again** asks it again for every part |

The list's name is its title. **Save** keeps it in this browser, the header says when there are unsaved changes, and **My lists** switches to another saved list, starts a new one or copies this one as text. The list on the tab is kept when the page is reloaded.

## Saved

Two tabs, **Starred items** and **Parts lists**; the page opens on the one you used last.

**Starred items** shows today's price for each item and, when it moved, how much since you starred it. **Update prices** re-checks each one directly at its shop. The filters pick out what got cheaper, pricier, or can't be bought now; an item out of stock or **No longer listed** has **Find elsewhere**, which searches every shop for it. Tick items to see what they cost together, then add them to a parts list, copy or remove them in one go. Removing has **Undo**.

**Parts lists** are cards with each list's first parts, its total and from how many shops. **Update prices** prices one list or all of them again, and each card shows how its total moved; **changed since** means parts were added after it was priced. The ⋯ menu opens, renames, duplicates, copies or deletes a list.

Opening a saved list shows it on the **Parts list** tab and prices it again. The products you chose are kept with the list and chosen again when you open it. If the search doesn't find one any more, its shop is asked about it: one still for sale stays your pick, and one **Out of stock** or **No longer sold**, or at a shop that didn't answer (**Couldn't check**), stays on its row, faded, with **Choose another**, and isn't counted in the total until you do. A saved list's total includes delivery, using the plan it would be bought with.

Saved items live in your browser's storage, so they're private to that browser and device. Clearing site data or using a private window removes them: **Back up** downloads them as a file, with your delivery fees, and **Restore** adds a backup's items and lists back. It takes the backup's delivery fees only if this browser has none of its own set.

---

More: [how it works](how-it-works.md) · [development](development.md) · [the MCP server](../mcp/README.md) · [what changed](../CHANGELOG.md)

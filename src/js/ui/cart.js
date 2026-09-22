// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Putting products into the shops' own carts.

import { SHOPS_BY_KEY } from "../shops.js";
import { packsNeeded } from "../search.js";
import { SHOP_TIMEOUT_MS } from "../config.js";

// the link that puts one product into its shop's cart, or null when it can't be done from here
export const cartLink = p => p.cart ? SHOPS_BY_KEY[p.shop]?.cartSteps?.([{ ...p, qty: 1 }])[0] ?? null : null;
export const cartShop = key => typeof SHOPS_BY_KEY[key]?.cartSteps === "function";
// a product sold in several colours or sizes, each of which can go in the cart once chosen
export const cartChoices = p => !p.cart && !!p.options && cartShop(p.shop) && typeof SHOPS_BY_KEY[p.shop].option === "function";

// Asks a product's shop which of its colours or sizes are in stock; `onEach(ref, inStock)` hears
// each as it answers. A choice the shop couldn't be asked about isn't heard of.
export function askChoices(p, onEach) {
  const shop = SHOPS_BY_KEY[p.shop];
  for (const x of p.options.choices) {
    shop.check(x.ref, AbortSignal.timeout(SHOP_TIMEOUT_MS)).then(now => onEach(x.ref, !!now?.in_stock && now.price > 0), () => {});
  }
}

// Puts one colour or size of a product into its shop's cart. The tab opens straight away, as the
// click allows, and goes to the cart once the shop has said how to add that choice. Gives a
// reason when it couldn't: then the tab is closed.
export async function cartChoice(p, ref) {
  const tab = window.open("about:blank", "_blank");
  const label = p.options.choices.find(x => x.ref === ref)?.label;
  try {
    const one = await SHOPS_BY_KEY[p.shop].option(p, ref, AbortSignal.timeout(SHOP_TIMEOUT_MS));
    const link = one?.in_stock ? cartLink(one) : null;
    if (!link) { tab?.close(); return `${label} is out of stock at ${p.shop_name}`; }
    if (tab) tab.location.href = link; else window.open(link, "_blank", "noopener");
    return null;
  } catch {
    tab?.close();
    return `${p.shop_name} didn't answer. Try again`;
  }
}


// why a product can't go into its shop's cart from here
export const noCart = c => cartShop(c.shop) ? "We can't add this one: it has options to choose on their site" : "We can't add to cart for this store";

const sameOrigin = w => { try { return w.document.URL === "about:blank"; } catch { return false; } };
async function until(test, ms) {
  const end = Date.now() + ms;
  while (!test() && Date.now() < end) await new Promise(r => setTimeout(r, 150));
}

// Puts parts-list products ([{ line, product }]) into a shop's cart, in a new tab that ends on
// the cart. A Shopify link takes them all at once; a WooCommerce link takes one, so the tab
// visits one link after another. Products with options to choose can't be added from a link, so
// they are left out. Each link has to reach the shop before the next, or the shop could
// start a second cart: the tab goes back to a blank page of this site in between, and the shop's
// page taking its place shows the shop has answered. `onStep(done, total)` reports progress.
export async function fillCart(key, entries, onStep) {
  const shop = SHOPS_BY_KEY[key];
  const items = entries.filter(e => e.product.cart).map(e => ({ ...e.product, qty: packsNeeded(e.line, e.product) }));
  if (!items.length) return;
  const steps = shop.cartSteps(items);
  if (steps.length === 1) { window.open(steps[0], "_blank", "noopener"); return; }
  // opened without noopener: a tab cut off from this page couldn't be sent on to the next link
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  for (let i = 0; i < steps.length && !tab.closed; i++) {
    onStep?.(i, steps.length);
    if (i) {
      tab.location.href = "about:blank";
      await until(() => tab.closed || sameOrigin(tab), 15000);
    }
    tab.location.href = steps[i];
    await until(() => tab.closed || !sameOrigin(tab), 30000);
  }
  onStep?.(steps.length, steps.length);
}

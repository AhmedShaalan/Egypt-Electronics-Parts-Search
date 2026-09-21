// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Putting products into the shops' own carts.

import { SHOPS_BY_KEY } from "../shops.js";
import { packsNeeded } from "../search.js";

// a cart button in the parts list: shows its progress, and afterwards what it couldn't add
export async function startCart(btn, key, entries) {
  const label = btn.querySelector("span");
  const idle = label.textContent;
  const note = btn.closest("[data-cart-area]").querySelector(".cart-note");
  const shop = SHOPS_BY_KEY[key].name;
  const left = entries.filter(e => !e.product.cart).map(e => `“${e.line.query}”`);
  btn.disabled = true;
  note.textContent = "";
  try {
    await fillCart(key, entries, (done, total) => { label.textContent = done < total ? `${done + 1} of ${total}…` : idle; });
    if (left.length) note.textContent = `Add ${left.join(", ")} on ${shop}'s page: ${left.length === 1 ? "it has" : "they have"} options to choose.`;
  } catch (e) {
    note.textContent = e.message;
  } finally {
    label.textContent = idle;
    btn.disabled = false;
  }
}

export const CART_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.9a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/></svg>`;

// the link that puts one product into its shop's cart, or null when it can't be done from here
export const cartLink = p => p.cart ? SHOPS_BY_KEY[p.shop]?.cartSteps?.([{ ...p, qty: 1 }])[0] ?? null : null;
export const cartShop = key => typeof SHOPS_BY_KEY[key]?.cartSteps === "function";


// why a product can't go into its shop's cart from here
export const noCart = c => cartShop(c.shop) ? "We can't add this one: it has options to choose" : "We can't add to cart for this store";

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
async function fillCart(key, entries, onStep) {
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

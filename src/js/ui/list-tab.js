// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Parts list tab: a pasted list priced at every shop, with the cheapest mix, a picker per
// line, changing a part, the shops' carts and saving the list.

import { SHOPS, SHOPS_BY_KEY } from "../shops.js";
import { priceList, priceLine, cheapestPicks, shopTotals, lineCost, packsNeeded, saveList as storeList, updateList } from "../search.js";
import { $, esc, money, toast, announce, key, thumb, safeUrl, priceDetail, loadingHtml, setProgress } from "./common.js";
import { CART_ICON, cartShop, noCart, startCart } from "./cart.js";
import { updateSavedCount } from "./saved.js";
import { openPicker, closePicker, pickerOpenFor, forgetPicker } from "./picker.js";

let listData = null;        // last parts-list response
let listText = "";          // text that produced listData
let picks = [];             // chosen candidate index per line
let defaultPicks = [];      // the cheapest picks, before the visitor changed any
let openedList = null;      // the saved list being shown: { id, name, savedText, savedPicks }, as last saved

$("#list-run").addEventListener("click", () => runList($("#list-text").value));
// the products chosen instead of the cheapest, by part name: what a saved list keeps of the picks
const pickMap = () => Object.fromEntries(listData.lines.flatMap((l, i) =>
  picks[i] !== defaultPicks[i] && l.candidates[picks[i]] ? [[l.query, key(l.candidates[picks[i]])]] : []));
const samePicks = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Save changes is offered once the list or its picks differ from the saved list it came from
const listDirty = () => openedList && (listText !== openedList.savedText || !samePicks(pickMap(), openedList.savedPicks));

// puts back saved picks; a product no longer found leaves the cheapest, with a note on the line
function applyPicks(saved) {
  listData.lines.forEach((l, i) => {
    const want = saved?.[l.query];
    if (!want) return;
    const j = l.candidates.findIndex(c => key(c) === want);
    if (j >= 0) picks[i] = j; else l.pickGone = true;
  });
}

let listRun = 0; // bumped by each pricing, so an older one finishing late doesn't replace it

// `from` is the saved list being opened, if any. Pricing other text stops it being tied to
// the saved list it came from, so Save doesn't overwrite that list by accident.
export async function runList(text, from = null) {
  if (!text.trim()) { toast("Paste at least one part"); return; }
  const run = ++listRun;
  const out = $("#list-out");
  const btn = $("#list-run");
  btn.disabled = true;
  const n = text.split("\n").filter(l => l.trim()).length;
  out.innerHTML = loadingHtml(`Pricing ${n} part${n === 1 ? "" : "s"} across all shops…`, n, "parts");
  const progress = out.querySelector(".progress");
  try {
    const data = await priceList(text, (done, total) => setProgress(progress, done, total, "parts"));
    if (run !== listRun) return;
    listData = data;
    listText = text;
    picks = cheapestPicks(listData.lines);
    defaultPicks = picks.slice();
    if (from) openedList = { id: from.id, name: from.name, savedText: text, savedPicks: from.picks || {} };
    else if (openedList && text !== openedList.savedText) openedList = null;
    if (openedList) {
      applyPicks(openedList.savedPicks);
      // what was saved and can't be restored doesn't count as a change
      openedList.savedPicks = pickMap();
    }
    renderList();
    announce(`Priced ${listData.lines.length} part${listData.lines.length === 1 ? "" : "s"}`);
  } catch (e) {
    if (run === listRun) out.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  } finally {
    if (run === listRun) btn.disabled = false;
  }
}

const findable = () => listData.lines.filter(l => l.candidates.length).length;

function renderList() {
  const out = $("#list-out");
  forgetPicker(); // redrawing removes an open picker
  const lines = listData.lines;
  let mixTotal = 0;
  const mixShops = new Set();
  let found = 0;
  lines.forEach((l, i) => {
    const c = l.candidates[picks[i]];
    if (c) { mixTotal += lineCost(l, c); mixShops.add(c.shop_name); found++; }
  });
  const mixLabel = picks.some((p, i) => p !== defaultPicks[i]) ? "Your picks" : "Cheapest mix";
  // the picks by shop, for the cart buttons
  const byShop = new Map();
  lines.forEach((l, i) => {
    const c = l.candidates[picks[i]];
    if (c) byShop.set(c.shop, [...(byShop.get(c.shop) || []), { line: l, product: c }]);
  });
  const cartable = [...byShop].filter(([k]) => cartShop(k));
  const manual = [...byShop.keys()].filter(k => !cartShop(k)).map(k => SHOPS_BY_KEY[k].name);
  const totals = shopTotals(listData, picks);
  const complete = totals.filter(s => !s.missing.length);
  const bestShop = complete[0];
  const failed = listData.failed_shops;

  out.innerHTML = `
    ${failed.length ? `<div class="chips">${failed.map(s => `<span class="chip fail" title="${esc(s.error)}">${esc(s.name)} · failed</span>`).join("")}</div>` : ""}
    <div class="summary">
      <div class="card">
        <div class="label">${mixLabel}</div>
        <div class="big">${money(mixTotal)}</div>
        <div class="sub">${found}/${lines.length} parts from ${mixShops.size} shop${mixShops.size === 1 ? "" : "s"}</div>
      </div>
      <div class="card">
        <div class="label">Everything from one shop</div>
        ${bestShop
          ? `<div class="big">${money(bestShop.total)}</div><div class="sub">${esc(bestShop.name)}${bestShop.total > mixTotal ? ` · +${money(bestShop.total - mixTotal)} vs ${mixLabel.toLowerCase()}` : ""}</div>`
          : `<div class="big">—</div><div class="sub">No shop has every part${totals[0] ? `. Closest: ${esc(totals[0].name)}, missing ${totals[0].missing.length}` : ""}</div>`}
      </div>
    </div>
    <div class="toolbar" style="margin-top:0">
      ${openedList ? `
        <span class="grow list-from">Saved list: <b>${esc(openedList.name)}</b>${listDirty() ? " · changed" : ""}</span>
        ${listDirty()
          ? `<button class="btn" id="list-save">Save as new list</button><button class="btn primary" id="list-update">Save changes</button>`
          : `<button class="btn" disabled>Saved ✓</button>`}`
        : `<span class="grow"></span><button class="btn" id="list-save">☆ Save this list</button>`}
    </div>

    <h2 class="with-total">${mixLabel} <span class="total">${money(mixTotal)}</span></h2>
    ${byShop.size ? `<div class="mix-cart" data-cart-area>
      <div class="cart-bar">
        ${cartable.length ? `<span class="label">Add to cart:</span>` : ""}
        ${cartable.map(([k, e]) => `<button type="button" class="btn small" data-cart-mix="${esc(k)}" title="Add ${e.length === 1 ? "this part" : `these ${e.length} parts`} to the cart at ${esc(SHOPS_BY_KEY[k].name)}, in a new tab">${CART_ICON}<span>${esc(SHOPS_BY_KEY[k].name)} · ${e.length}</span></button>`).join("")}
      </div>
      ${manual.length ? `<p class="hint">The cart at ${esc(manual.join(", "))} can't be filled from here; add ${manual.length === 1 ? "its parts on its" : "their parts on their"} site.</p>` : ""}
      <p class="hint cart-note" role="status"></p>
    </div>` : ""}
    <div class="list">${lines.map(lineRow).join("")}</div>

    <h2>Total by shop</h2>
    <div data-cart-area>
    <table>
      <thead><tr><th>Shop</th><th class="num">Parts</th><th class="num">Total</th><th><span class="sr-only">Cart</span></th></tr></thead>
      <tbody>
        ${totals.map((s, i) => `
          <tr class="${!s.missing.length && i === 0 ? "best" : ""}">
            <td>${esc(s.name)}${s.missing.length ? `<div class="missing">Missing: ${s.missing.map(esc).join(", ")}</div>` : ""}</td>
            <td class="num">${s.found}/${findable()}</td>
            <td class="num">${money(s.total)}</td>
            <td class="cart-cell">${cartShop(s.key) ? `<button type="button" class="btn small" data-cart-shop="${esc(s.key)}" title="Add these ${s.found} parts to the cart at ${esc(s.name)}, in a new tab">${CART_ICON}<span>Add</span></button>` : ""}</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="hint cart-note" role="status"></p>
    </div>
    <p class="hint">Shop totals use the same close matches as the picks above${found < lines.length ? " and skip parts no shop has" : ""}. Shipping isn't included.${listData.left_out ? ` Only the first ${lines.length} lines were priced; ${listData.left_out} more ${listData.left_out === 1 ? "was" : "were"} left out.` : ""}</p>
  `;

  out.querySelectorAll("[data-change]").forEach(b => { b.onclick = () => openChange(+b.dataset.change); });
  // without hover (phones) there is no tooltip, so a tap says it instead
  if (matchMedia("(hover: none)").matches) out.querySelectorAll(".cart-off").forEach(b => { b.onclick = () => toast(b.dataset.tip); });
  out.querySelectorAll("[data-pick]").forEach(b => {
    const i = +b.dataset.pick;
    b.onclick = () => pickerOpenFor(b) ? closePicker() : openPicker(b, lines[i], {
      picked: picks[i],
      cheapest: defaultPicks[i],
      onChoose: (j) => {
        picks[i] = j;
        lines[i].pickGone = false;
        renderList();
        $(`#list-out [data-pick="${i}"]`)?.focus();
      },
    });
  });
  $("#list-save")?.addEventListener("click", saveList);
  $("#list-update")?.addEventListener("click", saveChanges);
  out.querySelectorAll("[data-cart-mix]").forEach(b => { b.onclick = () => startCart(b, b.dataset.cartMix, byShop.get(b.dataset.cartMix)); });
  out.querySelectorAll("[data-cart-shop]").forEach(b => { b.onclick = () => startCart(b, b.dataset.cartShop, totals.find(s => s.key === b.dataset.cartShop).used); });
}

function lineRow(line, i) {
  const c = line.candidates[picks[i]];
  if (!c) {
    return `<div class="line"><div class="line-head"><span class="q">${line.qty} × ${esc(line.query)} ${changeButton(line, i)}</span><span class="badge bad">Not found</span></div>
      <div class="meta">No shop has this in stock. Try a different name or part number.</div></div>`;
  }
  const n = line.candidates.length;
  const packs = packsNeeded(line, c);
  // this line's product and quantity (in packs) into its shop's cart
  const cart = c.cart ? SHOPS_BY_KEY[c.shop]?.cartSteps?.([{ ...c, qty: packs }])[0] : null;
  const chosen = `${thumb(c)}
    <span class="choice-text">
      <span class="choice-name">${esc(c.name)}</span>
      <span class="choice-meta">${esc(c.shop_name)} · ${priceDetail(line, c)}</span>
    </span>`;
  return `
    <div class="line">
      <div class="line-head">
        <span class="q">${line.qty} × ${esc(line.query)} ${changeButton(line, i)}${line.weak ? '<span class="badge warn">Check match</span>' : ""}${line.pickGone ? '<span class="badge warn" title="The product saved for this part is sold out or gone, so the cheapest is picked">Your pick is no longer available</span>' : ""}</span>
        <span class="cost">${money(lineCost(line, c))}</span>
      </div>
      <div class="choice-row">
        ${n > 1
          ? `<button type="button" class="choice" data-pick="${i}" aria-haspopup="listbox" aria-expanded="false">${chosen}
              <span class="choice-more">${n}<span class="choice-word"> options</span><span class="sr-only"> for ${esc(line.query)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>
            </button>`
          : `<div class="choice">${chosen}</div>`}
        <a class="icon-btn" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener" title="Open at ${esc(c.shop_name)}" aria-label="Open ${esc(c.name)} at ${esc(c.shop_name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        </a>
        ${cart
          ? `<a class="icon-btn" href="${esc(cart)}" target="_blank" rel="noopener" title="Add ${packs === 1 ? "it" : packs} to the cart at ${esc(c.shop_name)}" aria-label="Add ${esc(c.name)} to the cart at ${esc(c.shop_name)}">${CART_ICON}</a>`
          // shown faded, with a tooltip saying why; on a phone, a tap shows it
          : `<button type="button" class="icon-btn cart-off" aria-disabled="true" data-tip="${esc(noCart(c))}" aria-label="${esc(noCart(c))}">${CART_ICON}</button>`}
      </div>
    </div>`;
}

const changeButton = (line, i) => `<button type="button" class="icon-btn edit" data-change="${i}" title="Change this part" aria-label="Change ${esc(line.query)}">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`;

/* ---------- changing a part in a priced list ---------- */
// The modal searches every shop for the new name and replaces just that line, with the
// cheapest close match picked; the pasted list gets the same change, so saving keeps it.
let changing = null; // { i, cancel } while the modal is open

function openChange(i) {
  const line = listData.lines[i];
  changing = { i, cancel: new AbortController() };
  $("#change-name").value = line.query;
  $("#change-qty").value = line.qty;
  $("#change-status").textContent = "";
  $("#change-go").disabled = false;
  $("#change-dialog").showModal();
  $("#change-name").select();
}

$("#change-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!changing) return;
  const { i, cancel } = changing;
  const run = listRun;
  const name = $("#change-name").value.trim();
  const qty = Math.max(1, Math.min(9999, parseInt($("#change-qty").value, 10) || 1));
  const status = $("#change-status");
  if (name.length < 2) { $("#change-name").focus(); return; }
  $("#change-go").disabled = true;
  status.textContent = `Searching ${SHOPS.length} shops for “${name}”…`;
  try {
    const { line, failed_shops } = await priceLine(name, qty, {
      cancel: cancel.signal,
      onProgress: (done, total) => { status.textContent = `Searching for “${name}”… ${done} of ${total} shops`; },
    });
    // closed, or a new list priced, while it searched
    if (changing?.cancel !== cancel || run !== listRun) return;
    if (!line.candidates.length) {
      status.textContent = `No shop has “${name}” in stock. Try another name or part number.`;
      $("#change-go").disabled = false;
      $("#change-name").select();
      return;
    }
    const old = listData.lines[i];
    line.row = old.row;
    listData.lines[i] = line;
    picks[i] = defaultPicks[i] = cheapestPicks([line])[0];
    for (const s of failed_shops) if (!listData.failed_shops.some(f => f.key === s.key)) listData.failed_shops.push(s);
    // the same change in the pasted list, unless it was edited since it was priced
    const rows = listText.split(/\r?\n/);
    if (old.row !== undefined && old.row < rows.length) {
      rows[old.row] = qty > 1 ? `${name} x${qty}` : name;
      const text = rows.join("\n");
      if ($("#list-text").value === listText) $("#list-text").value = text;
      listText = text;
    }
    changing = null;
    $("#change-dialog").close();
    renderList();
    $(`#list-out [data-change="${i}"]`)?.focus();
    toast(`Changed to “${name}”`);
  } catch (err) {
    if (changing?.cancel !== cancel) return;
    status.textContent = err.message;
    $("#change-go").disabled = false;
  }
});

// closing stops a search still running
$("#change-dialog").addEventListener("close", () => {
  changing?.cancel.abort();
  changing = null;
});
$("#change-cancel").addEventListener("click", () => $("#change-dialog").close());
$("#change-dialog").addEventListener("click", e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});


const listTotal = () => listData.lines.reduce((sum, l, i) => sum + (l.candidates[picks[i]] ? lineCost(l, l.candidates[picks[i]]) : 0), 0);

// saves as a new list, which is then the one being shown
async function saveList() {
  const name = prompt("Name this list", openedList ? `${openedList.name} (copy)` : "Parts list " + new Date().toLocaleDateString());
  if (name === null) return;
  try {
    const list = storeList(name, listText, listTotal(), pickMap());
    openedList = { id: list.id, name: list.name, savedText: listText, savedPicks: pickMap() };
    updateSavedCount();
    renderList();
    toast("List saved");
  } catch (e) { toast(e.message); }
}

// saves the changes over the saved list this one was opened from
function saveChanges() {
  try {
    const list = updateList(openedList.id, listText, listTotal(), pickMap());
    // deleted from the Saved tab meanwhile: save it as a new list instead
    if (!list) { openedList = null; saveList(); return; }
    openedList.savedText = listText;
    openedList.savedPicks = pickMap();
    updateSavedCount();
    renderList();
    toast(`Saved changes to “${list.name}”`);
  } catch (e) { toast(e.message); }
}

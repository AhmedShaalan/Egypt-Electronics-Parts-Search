// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Saved tab: starred items, with how their prices moved since they were starred, and saved
// parts lists as cards. Everything is kept in this browser, so it can be backed up to a file.

import { render } from "preact";
import { useEffect, useReducer, useRef } from "preact/hooks";
import { deleteItems, restoreSaved, refreshItems, renameList, deleteList, duplicateList, setListPrice, exportSaved, importSaved } from "../search.js";
import { $, money, toast, safeUrl } from "./common.js";
import { COPY_FORMATS, copy, copyText } from "./copy.js";
import { cartLink } from "./cart.js";
import { currentSaved, onSavedChange, reloadSaved, partCount } from "./saved.js";
import { openAddToList, addToLastList, lastList } from "./add-to-list.js";
import { openSavedList, startNewList, priceSavedList } from "./list-tab.jsx";
import { searchFor } from "./search-tab.jsx";
import { createStore } from "./store.js";

const TAB_KEY = "egypt-parts-search:saved-tab";

/* ---------- state ---------- */

const store = createStore({
  tab: loadTab(),        // "items" or "lists", the one used last
  filter: "all",
  sort: "new",
  selected: new Set(),   // ticked item ids
  checking: null,        // { done, total } while item prices are being updated
  flash: new Set(),      // items whose price just changed
  updating: new Set(),   // parts lists being priced again
  moved: new Map(),      // list id -> how its total moved when it was last priced here
  renaming: null,        // the list in the rename dialog
  tick: 0,               // bumped when the saved items or lists change
});
const { set } = store;
onSavedChange(() => set({ tick: store.state.tick + 1 }));

function loadTab() {
  try { return localStorage.getItem(TAB_KEY) === "lists" ? "lists" : "items"; } catch { return "items"; }
}
function setTab(tab) {
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* remembered for this visit only */ }
  set({ tab });
}

// called when the tab is shown: what's saved may have changed on another tab
export function loadSaved() {
  reloadSaved();
}

/* ---------- helpers ---------- */

const num = n => money(n).replace(" EGP", "");
const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
const buyable = it => it.available && it.in_stock;
// how an item changed since it was starred
const kind = it => !buyable(it) ? "cant" : it.price < it.saved_price - 0.005 ? "down" : it.price > it.saved_price + 0.005 ? "up" : "same";

function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${plural(mins, "minute")} ago`;
  if (mins < 60 * 24) return `${plural(Math.round(mins / 60), "hour")} ago`;
  const days = Math.round(mins / (60 * 24));
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

const SORTS = {
  new: (a, b) => b.saved_at.localeCompare(a.saved_at),
  drop: (a, b) => (a.price - a.saved_price) - (b.price - b.saved_price),
  shop: (a, b) => a.shop_name.localeCompare(b.shop_name) || b.saved_at.localeCompare(a.saved_at),
  price: (a, b) => a.price - b.price,
};

/* ---------- actions ---------- */

function removeItems(ids) {
  const removed = deleteItems(ids);
  const selected = new Set(store.state.selected);
  ids.forEach(id => selected.delete(id));
  set({ selected });
  reloadSaved();
  toast(ids.length === 1 ? "Removed from saved" : `Removed ${ids.length} items`, {
    label: "Undo", run: () => { restoreSaved({ items: removed }); reloadSaved(); },
  });
}

// asks each item's shop again; the ones whose price changed flash
async function updateItemPrices() {
  const before = new Map(currentSaved().items.map(it => [it.id, it.price]));
  set({ checking: { done: 0, total: before.size } });
  try {
    const { items, failed } = await refreshItems((done, total) => set({ checking: { done, total } }));
    reloadSaved();
    const changed = items.filter(it => before.has(it.id) && Math.abs(before.get(it.id) - it.price) >= 0.005);
    const cheaper = changed.filter(it => it.price < before.get(it.id)).length;
    const parts = [cheaper && `${cheaper} cheaper`, changed.length - cheaper && `${changed.length - cheaper} pricier`].filter(Boolean);
    set({ flash: new Set(changed.map(it => it.id)) });
    setTimeout(() => set({ flash: new Set() }), 1600);
    toast((parts.length ? `Prices updated: ${parts.join(", ")} than last time` : "Prices updated: nothing changed")
      + (failed ? `. ${plural(failed, "item")} couldn't be checked` : ""));
  } catch (e) {
    toast(e.message);
  } finally {
    set({ checking: null });
  }
}

// prices lists again, one after another; each card then shows how its total moved
async function updateLists(ids) {
  ids = ids.filter(id => !store.state.updating.has(id));
  if (!ids.length) return;
  set(s => ({ updating: new Set([...s.updating, ...ids]) }));
  let movedCount = 0;
  let last = null;
  for (const id of ids) {
    try {
      const l = currentSaved().lists.find(x => x.id === id);
      const priced = l && await priceSavedList(l);
      // null when the list was changed or deleted while it was priced
      const before = priced ? setListPrice(id, l.text, priced.total, priced.shops) : null;
      last = priced && { total: priced.total, before };
      if (last) {
        const moved = new Map(store.state.moved);
        const diff = last.before == null ? 0 : Math.round((last.total - last.before) * 100) / 100;
        moved.set(id, diff);
        if (diff) movedCount++;
        set({ moved });
      }
    } catch (e) {
      toast(e.message);
    }
    set(s => { const updating = new Set(s.updating); updating.delete(id); return { updating }; });
    reloadSaved();
  }
  if (ids.length === 1 && last) {
    const l = currentSaved().lists.find(x => x.id === ids[0]);
    const diff = store.state.moved.get(ids[0]);
    toast(`${l?.name ?? "List"}: ${money(last.total)}${diff ? `, ${diff < 0 ? "down" : "up"} ${money(Math.abs(diff))}` : ""}`);
  } else if (ids.length > 1) {
    toast(`Prices updated: ${movedCount ? `${plural(movedCount, "list")} changed` : "nothing changed"}`);
  }
}

function removeList(l) {
  const removed = deleteList(l.id);
  reloadSaved();
  toast(`Deleted “${l.name}”`, { label: "Undo", run: () => { restoreSaved({ lists: removed }); reloadSaved(); } });
}

function duplicate(l) {
  try {
    const copyOf = duplicateList(l.id);
    reloadSaved();
    toast(`Duplicated as “${copyOf.name}”`);
  } catch (e) { toast(e.message); }
}

const listParts = l => l.text.split("\n").map(x => x.trim()).filter(Boolean);
const copyList = (l, withTotal) => copy(`${l.name}\n\n${listParts(l).join("\n")}${withTotal && l.saved_total != null ? `\n\nTotal when priced: ${money(l.saved_total)}` : ""}`);

function backUp() {
  const blob = new Blob([JSON.stringify(exportSaved(), null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `egypt-parts-saved-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded");
}

async function restoreFrom(file) {
  if (!file) return;
  try {
    const added = importSaved(JSON.parse(await file.text()));
    reloadSaved();
    toast(added.items || added.lists
      ? `Restored ${[added.items && plural(added.items, "item"), added.lists && plural(added.lists, "list")].filter(Boolean).join(" and ")}`
      : "Nothing new in that backup: it's all here already");
  } catch (e) {
    toast(e instanceof SyntaxError ? "That file isn't a backup from this site" : e.message);
  }
}

/* ---------- icons ---------- */

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
const CartIcon = () => <svg {...svg}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.9a1.5 1.5 0 0 0 1.5-1.1L21 7H6" /></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
const ExtIcon = () => <svg {...svg}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const SearchIcon = () => <svg {...svg}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const AddIcon = () => <svg {...svg}><path d="M3 6h11M3 12h11M3 18h7M18 14v8M14 18h8" /></svg>;
const ListsIcon = () => <svg {...svg}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const CopyIcon = () => <svg {...svg}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const TrashIcon = () => <svg {...svg}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>;
const PenIcon = () => <svg {...svg}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
const DupIcon = () => <svg {...svg}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>;
const OpenIcon = () => <svg {...svg}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const PlusIcon = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>;
const RefreshIcon = () => <svg {...svg}><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></svg>;
const DownloadIcon = () => <svg {...svg}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>;
const UploadIcon = () => <svg {...svg}><path d="M12 21V9M7 14l5-5 5 5M4 4h16" /></svg>;
const CloseIcon = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>;

/* ---------- pieces ---------- */

function Thumb({ p }) {
  const [failed, fail] = useReducer(() => true, false);
  const src = p.image && safeUrl(p.image) !== "#" && !failed ? p.image : null;
  return src ? <img class="v-thumb" src={src} alt="" loading="lazy" referrerpolicy="no-referrer" onError={fail} /> : <span class="v-thumb" />;
}

// a ⋯ menu; the arrow keys, Escape and clicking elsewhere are handled for every details.menu (copy.js)
function Menu({ label, children }) {
  return (
    <details class="menu right s-menu" onClick={e => { if (e.target.closest('[role="menuitem"]')) e.currentTarget.open = false; }}>
      <summary class="s-icon" title="More" aria-label={label}><DotsIcon /></summary>
      <div class="menu-list" role="menu">{children}</div>
    </details>
  );
}

function ItemRow({ it, s }) {
  const k = kind(it);
  const diff = it.price - it.saved_price;
  const cart = k !== "cant" ? cartLink(it) : null;
  const url = safeUrl(it.url);
  const ticked = s.selected.has(it.id);
  const last = lastList();
  const tick = on => {
    const selected = new Set(s.selected);
    on ? selected.add(it.id) : selected.delete(it.id);
    set({ selected });
  };
  return (
    <div class={`v-item${ticked ? " selected" : ""}${k === "cant" ? " gone" : ""}${s.flash.has(it.id) ? " flash" : ""}`}>
      <label class="v-tick"><input type="checkbox" checked={ticked} onChange={e => tick(e.currentTarget.checked)} aria-label={`Select ${it.name}`} /></label>
      <Thumb p={it} />
      <div class="v-text">
        <a class="v-name" href={url} target="_blank" rel="noopener">{it.name}</a>
        <div class="v-meta"><span class="v-shop">{it.shop_name}</span> · starred {ago(it.saved_at)}</div>
        {k === "cant"
          ? <div class="v-status">
              <span class="s-chip bad">{it.available ? "Out of stock" : "No longer listed"}</span>
              <button class="s-linkbtn" type="button" onClick={() => searchFor(it.name)}>Find elsewhere</button>
            </div>
          : k !== "same" && <div class="v-status"><span class={`v-delta ${k}`}>{k === "down" ? "▼" : "▲"} {num(Math.abs(diff))} EGP since saved</span></div>}
      </div>
      <div class="v-price">{k === "cant" ? <s>{money(it.price)}</s> : <b>{money(it.price)}</b>}</div>
      <div class="s-acts">
        {cart
          ? <a class="s-icon" href={cart} target="_blank" rel="noopener" title={`Add to cart at ${it.shop_name}`} aria-label={`Add to cart at ${it.shop_name}`}><CartIcon /></a>
          : <span class="s-icon-space" />}
        <Menu label={`More for ${it.name}`}>
          <a role="menuitem" href={url} target="_blank" rel="noopener"><ExtIcon /> Open at {it.shop_name}</a>
          <button type="button" role="menuitem" onClick={() => searchFor(it.name)}><SearchIcon /> Search every shop for it</button>
          {last && <button type="button" role="menuitem" onClick={() => addToLastList(it)}><AddIcon /> Add to “{last.name}”</button>}
          <button type="button" role="menuitem" onClick={() => openAddToList(it)}><ListsIcon /> {last ? "Add to another list…" : "Add to a parts list…"}</button>
          <button type="button" role="menuitem" onClick={() => copy(copyText([it], COPY_FORMATS[3]))}><CopyIcon /> Copy name, price and link</button>
          <hr />
          <button type="button" role="menuitem" class="danger" onClick={() => removeItems([it.id])}><TrashIcon /> Remove from saved</button>
        </Menu>
      </div>
    </div>
  );
}

function Items({ s, items }) {
  if (!items.length) {
    return (
      <div class="v-empty">
        <h2>Nothing starred yet</h2>
        <p>Tap ☆ on a search result to keep an eye on its price. It shows up here with how it's changed since.</p>
        <button class="btn primary" type="button" onClick={() => { location.hash = "#search"; setTimeout(() => $("#q").focus(), 50); }}>Search for a part</button>
      </div>
    );
  }
  const count = k => items.filter(it => kind(it) === k).length;
  const shown = items.filter(it => s.filter === "all" || kind(it) === s.filter).sort(SORTS[s.sort]);
  const allTicked = shown.length > 0 && shown.every(it => s.selected.has(it.id));
  const lastCheck = items.map(it => it.checked_at).sort().pop();
  const chip = (id, label, n) => (
    <button class="v-fchip" type="button" aria-pressed={s.filter === id} disabled={!n && id !== "all"} onClick={() => set({ filter: id })}>
      {label}<span class="v-n">{n}</span>
    </button>
  );
  const tickAll = on => {
    const selected = new Set(s.selected);
    shown.forEach(it => on ? selected.add(it.id) : selected.delete(it.id));
    set({ selected });
  };
  return <>
    <div class="v-toolbar">
      {chip("all", "All", items.length)}{chip("down", "Cheaper now", count("down"))}{chip("up", "Pricier", count("up"))}{chip("cant", "Can't buy", count("cant"))}
      <select aria-label="Sort" value={s.sort} onChange={e => set({ sort: e.currentTarget.value })}>
        <option value="new">Newest first</option>
        <option value="drop">Biggest drop first</option>
        <option value="shop">By shop</option>
        <option value="price">Cheapest first</option>
      </select>
    </div>
    <div class="v-list">
      <div class="v-list-top">
        <label><input type="checkbox" checked={allTicked} disabled={!shown.length} onChange={e => tickAll(e.currentTarget.checked)} /> Select all</label>
        <span class="v-checked">{s.checking
          ? <><span class="s-bar-anim" />Updating {Math.min(s.checking.done + 1, s.checking.total)} of {s.checking.total}…</>
          : <>{lastCheck && `Prices updated ${ago(lastCheck)}`}<button class="btn small v-btn" type="button" onClick={updateItemPrices}><RefreshIcon /> Update prices</button></>}</span>
      </div>
      {shown.length
        ? shown.map(it => <ItemRow key={it.id} it={it} s={s} />)
        : <div class="v-empty inner"><p>Nothing here right now.</p><button class="s-linkbtn" type="button" onClick={() => set({ filter: "all" })}>Show all</button></div>}
    </div>
  </>;
}

function ListCard({ l, s }) {
  const parts = listParts(l);
  const preview = parts.slice(0, 4);
  const updating = s.updating.has(l.id);
  const moved = s.moved.get(l.id);
  const priced = l.saved_total != null;
  // the whole card opens the list; its buttons and menu do their own thing
  const open = e => { if (!e.target.closest("button, a, details")) openSavedList(l.id); };
  return (
    <article class={`v-lcard${updating ? " updating" : ""}`} onClick={open}>
      <div class="v-l-head">
        <button class="v-l-name" type="button" title={`Open ${l.name}`} onClick={() => openSavedList(l.id)}>{l.name}</button>
        <Menu label={`More for ${l.name}`}>
          <button type="button" role="menuitem" onClick={() => openSavedList(l.id)}><OpenIcon /> Open</button>
          <button type="button" role="menuitem" onClick={() => updateLists([l.id])}><RefreshIcon /> Update prices</button>
          <button type="button" role="menuitem" onClick={() => set({ renaming: l })}><PenIcon /> Rename…</button>
          <button type="button" role="menuitem" onClick={() => duplicate(l)}><DupIcon /> Duplicate</button>
          <button type="button" role="menuitem" onClick={() => copyList(l, false)}><CopyIcon /> Copy parts</button>
          {priced && <button type="button" role="menuitem" onClick={() => copyList(l, true)}><CopyIcon /> Copy parts and total</button>}
          <hr />
          <button type="button" role="menuitem" class="danger" onClick={() => removeList(l)}><TrashIcon /> Delete</button>
        </Menu>
      </div>
      <div class="v-l-meta">
        {plural(partCount(l), "part")} · {priced
          ? <><b>{money(l.saved_total)}</b>{l.saved_shops ? ` from ${plural(l.saved_shops, "shop")}` : ""}
              {moved ? <span class={`v-delta ${moved < 0 ? "down" : "up"}`} title={`${moved < 0 ? "Cheaper" : "Pricier"} than the last time it was priced`}>{moved < 0 ? "▼" : "▲"} {num(Math.abs(moved))} EGP</span> : null}
              {l.changed && <span class="s-chip soft" title="Parts were added after it was priced">changed since</span>}</>
          : "not priced yet"}
      </div>
      <ul class="v-l-parts">
        {preview.map((p, i) => <li key={i}>{p}</li>)}
        {parts.length > preview.length && <li class="v-more">+{parts.length - preview.length} more</li>}
      </ul>
      <div class="v-l-foot">
        {priced ? `Prices from ${ago(l.priced_at || l.saved_at)}` : `Saved ${ago(l.saved_at)}`}
        {updating
          ? <span class="v-l-updating"><span class="v-spin small" />Updating prices…</span>
          : <button class="s-icon v-l-refresh" type="button" title="Update prices" aria-label={`Update prices of ${l.name}`} onClick={() => updateLists([l.id])}><RefreshIcon /></button>}
      </div>
    </article>
  );
}

function Lists({ s, lists }) {
  const busy = s.updating.size;
  return <>
    <div class="v-toolbar">
      <span class="v-count">{plural(lists.length, "list")}</span>
      {lists.length > 0 && <span class="v-lists-update">{busy
        ? <><span class="s-bar-anim" />Updating prices, {plural(busy, "list")} to go…</>
        : <button class="btn small v-btn" type="button" onClick={() => updateLists(lists.map(l => l.id))}><RefreshIcon /> Update prices</button>}</span>}
    </div>
    <div class="v-cards">
      {lists.map(l => <ListCard key={l.id} l={l} s={s} />)}
      <button class="v-lcard new" type="button" onClick={startNewList}><PlusIcon /> New parts list</button>
    </div>
    {!lists.length && <p class="v-hint">Price a parts list, then save it, and it shows up here to open again later.</p>}
  </>;
}

// what's ticked, and what to do with it
function BulkBar({ s, items }) {
  const sel = items.filter(it => s.selected.has(it.id));
  if (s.tab !== "items" || !sel.length) return null;
  const cost = sel.filter(buyable).reduce((sum, it) => sum + it.price, 0);
  const cant = sel.filter(it => !buyable(it)).length;
  const clear = () => set({ selected: new Set() });
  return (
    <div class="v-bulk" role="region" aria-label="Selected items">
      <span class="v-what"><b>{sel.length}</b> selected · <b>{money(cost)}</b>{cant ? <span class="s-muted"> ({cant} can't be bought)</span> : null}</span>
      <button class="btn primary small v-btn" type="button" onClick={() => openAddToList(sel, { onAdded: clear })}><AddIcon /> Add to a parts list</button>
      <button class="btn small" type="button" onClick={() => copy(copyText(sel, COPY_FORMATS[2]))}>Copy</button>
      <button class="btn small" type="button" onClick={() => removeItems(sel.map(it => it.id))}>Remove</button>
      <button class="s-icon" type="button" title="Clear selection" aria-label="Clear selection" onClick={clear}><CloseIcon /></button>
    </div>
  );
}

function RenameDialog({ list }) {
  const dialog = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    if (!list) return;
    input.current.value = list.name;
    dialog.current.showModal();
    input.current.select();
  }, [list]);
  const submit = e => {
    e.preventDefault();
    const name = input.current.value.trim();
    if (!name) return input.current.focus();
    renameList(list.id, name);
    dialog.current.close();
    reloadSaved();
    toast("Renamed");
  };
  return (
    <dialog class="modal" ref={dialog} aria-labelledby="rename-title" onClose={() => set({ renaming: null })}>
      <form onSubmit={submit}>
        <h2 id="rename-title">Rename list</h2>
        <label class="modal-label" for="rename-input">Name</label>
        <input type="text" id="rename-input" ref={input} maxlength="80" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" style="width:100%" />
        <div class="modal-actions">
          <button type="button" class="btn" onClick={() => dialog.current.close()}>Cancel</button>
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}

function SavedApp() {
  const s = store.use();
  const { items, lists } = currentSaved();
  const fileInput = useRef(null);
  const tab = (id, label, n) => (
    <button type="button" role="tab" id={`saved-${id}`} aria-selected={s.tab === id} aria-controls="saved-pane" onClick={() => setTab(id)}>
      {label}<span class="v-n">{n}</span>
    </button>
  );
  return <>
    <div class="v-head">
      <div>
        <h1>Saved</h1>
        <p class="v-sub">Kept in this browser only. Clearing its data removes them, so back up once in a while.</p>
      </div>
      <div class="v-head-actions">
        <button class="btn small v-ghost" type="button" onClick={backUp} disabled={!items.length && !lists.length}><DownloadIcon /> Back up</button>
        <button class="btn small v-ghost" type="button" onClick={() => fileInput.current.click()}><UploadIcon /> Restore</button>
        <input type="file" accept="application/json,.json" ref={fileInput} hidden onChange={e => { restoreFrom(e.currentTarget.files[0]); e.currentTarget.value = ""; }} />
      </div>
    </div>
    <div class="v-tabs" role="tablist" aria-label="Saved">
      {tab("items", "Starred items", items.length)}{tab("lists", "Parts lists", lists.length)}
    </div>
    <div id="saved-pane" role="tabpanel" aria-labelledby={`saved-${s.tab}`}>
      {s.tab === "items" ? <Items s={s} items={items} /> : <Lists s={s} lists={lists} />}
    </div>
    <BulkBar s={s} items={items} />
    <RenameDialog list={s.renaming} />
  </>;
}

render(<SavedApp />, $("#saved-app"));

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The Saved tab's state, and what can be done to the saved items and lists.

import { deleteItems, restoreSaved, refreshItems, deleteList, duplicateList, setListPrice, exportSaved, importSaved } from "../../search.js";
import { money, toast } from "../common.js";
import { plural } from "../format.js";
import { copy } from "../copy.js";
import { currentSaved, onSavedChange, reloadSaved } from "../saved.js";
import { loadText, saveText } from "../storage.js";
import { createStore } from "../store.js";
import { priceSavedList } from "../list/index.js";

export const store = createStore({
  tab: loadText("saved-tab") === "lists" ? "lists" : "items", // the one used last
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
export const { set } = store;
onSavedChange(() => set({ tick: store.state.tick + 1 }));

export function setTab(tab) {
  saveText("saved-tab", tab);
  set({ tab });
}

/* ---------- items ---------- */

export const buyable = it => it.available && it.in_stock;
// how an item changed since it was starred
export const kind = it => !buyable(it) ? "cant" : it.price < it.saved_price - 0.005 ? "down" : it.price > it.saved_price + 0.005 ? "up" : "same";

export const SORTS = {
  new: (a, b) => b.saved_at.localeCompare(a.saved_at),
  drop: (a, b) => (a.price - a.saved_price) - (b.price - b.saved_price),
  shop: (a, b) => a.shop_name.localeCompare(b.shop_name) || b.saved_at.localeCompare(a.saved_at),
  price: (a, b) => a.price - b.price,
};

// ticks or unticks items
export function select(ids, on) {
  const selected = new Set(store.state.selected);
  ids.forEach(id => on ? selected.add(id) : selected.delete(id));
  set({ selected });
}

export function removeItems(ids) {
  const removed = deleteItems(ids);
  select(ids, false);
  reloadSaved();
  toast(ids.length === 1 ? "Removed from saved" : `Removed ${ids.length} items`, {
    label: "Undo", run: () => { restoreSaved({ items: removed }); reloadSaved(); },
  });
}

// asks each item's shop again; the ones whose price changed flash
export async function updateItemPrices() {
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

/* ---------- parts lists ---------- */

// prices lists again, one after another; each card then shows how its total moved
export async function updateLists(ids) {
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

export function removeList(l) {
  const removed = deleteList(l.id);
  reloadSaved();
  toast(`Deleted “${l.name}”`, { label: "Undo", run: () => { restoreSaved({ lists: removed }); reloadSaved(); } });
}

export function duplicate(l) {
  try {
    const copyOf = duplicateList(l.id);
    reloadSaved();
    toast(`Duplicated as “${copyOf.name}”`);
  } catch (e) { toast(e.message); }
}

export const listParts = l => l.text.split("\n").map(x => x.trim()).filter(Boolean);
export const copyList = (l, withTotal) => copy(`${l.name}\n\n${listParts(l).join("\n")}${withTotal && l.saved_total != null ? `\n\nTotal when priced: ${money(l.saved_total)}` : ""}`);

/* ---------- backing up ---------- */

export function backUp() {
  const blob = new Blob([JSON.stringify(exportSaved(), null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `egypt-parts-saved-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded");
}

export async function restoreFrom(file) {
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

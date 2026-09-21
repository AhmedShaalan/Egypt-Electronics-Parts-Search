// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Changing a row's name or quantity. A new name searches every shop for that part again, while
// the dialog stays open and counts the shops.

import { useRef, useState } from "preact/hooks";
import { SHOPS } from "../../shops.js";
import { searchAll } from "../../search.js";
import { MAX_QTY, withResult } from "../../list-model.js";
import { toast, NO_AUTOFILL } from "../common.js";
import { useModal } from "../use-modal.js";
import { set, change, flashRows, rowById } from "./state.js";
import { stopRow } from "./pricing.js";
import { setQty } from "./actions.js";

export function ChangeDialog({ r }) {
  const name = useRef(null);
  const qty = useRef(null);
  const [busy, setBusy] = useState(null); // { name, done } while searching
  const [error, setError] = useState("");
  const search = useRef(null);
  const modal = useModal(r?.id, () => {
    name.current.value = r.query;
    qty.current.value = r.qty;
    setError("");
    setBusy(null);
    name.current.select();
  });
  const submit = async e => {
    e.preventDefault();
    const q = name.current.value.replace(/\s+/g, " ").trim();
    const n = Math.max(1, Math.min(MAX_QTY, parseInt(qty.current.value, 10) || 1));
    if (q.length < 2) { setError("Type at least two characters."); name.current.focus(); return; }
    if (q === r.query) {
      modal.close();
      if (n !== r.qty) setQty(r.id, n);
      return;
    }
    const ctl = search.current = new AbortController();
    setError("");
    setBusy({ name: q, done: 0 });
    try {
      const result = await searchAll(q, { cancel: ctl.signal, onProgress: done => ctl === search.current && setBusy({ name: q, done }) });
      if (ctl !== search.current || ctl.signal.aborted) return;
      setBusy(null);
      if (!rowById(r.id)) { modal.close(); return; }
      const next = withResult({ ...rowById(r.id), query: q, qty: n, pinKey: null }, result);
      if (!next.line.candidates.length) {
        setError(`No shop has “${q}” in stock. Try another name or a part number.`);
        name.current.select();
        return;
      }
      stopRow(r.id);
      modal.close();
      change(s => ({ rows: s.rows.map(x => (x.id === r.id ? next : x)), filters: { ...s.filters, [r.id]: "" } }), r.id);
      flashRows([r.id]);
      toast(`Changed to “${q}”`);
    } catch (err) {
      if (ctl !== search.current) return;
      setBusy(null);
      setError(err.message);
    }
  };
  // closing stops a search still running
  const onClose = () => {
    search.current?.abort();
    search.current = null;
    set({ editing: null });
    requestAnimationFrame(() => document.querySelector(`[data-row="${r?.id}"] summary`)?.focus());
  };
  return (
    <dialog class="modal l-dialog" {...modal.props} aria-labelledby="l-change-title" onClose={onClose}>
      <form onSubmit={submit}>
        <h2 id="l-change-title">Change part</h2>
        <label class="modal-label" for="l-change-name">Name or part number</label>
        <input type="text" id="l-change-name" ref={name} maxlength="200" spellcheck={false} disabled={!!busy} {...NO_AUTOFILL} />
        <label class="modal-label" for="l-change-qty">Quantity</label>
        <input type="number" id="l-change-qty" ref={qty} min="1" max={MAX_QTY} inputmode="numeric" disabled={!!busy} />
        <p class="l-dlg-hint">A new name searches every shop again, for this part only.</p>
        {error ? <p class="l-dlg-error" role="alert">{error}</p> : null}
        {busy ? <div class="l-dlg-status" role="status"><span class="s-bar-anim" />Searching for “{busy.name}”… {busy.done} of {SHOPS.length} shops</div> : null}
        <div class="modal-actions">
          <button type="button" class="btn" onClick={modal.close}>Cancel</button>
          <button type="submit" class="btn primary" disabled={!!busy}>{busy ? "Searching…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
}

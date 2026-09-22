// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Asks before throwing away what changed since the list was saved, from the bar that floats over
// the list (list-app.jsx). A list that was never saved is emptied instead.

import { store, set, isSavedList } from "./state.js";
import { discardChanges } from "./actions.js";
import { useModal } from "../use-modal.js";

export function DiscardDialog() {
  const s = store.use();
  const modal = useModal(s.discarding, () => modal.ref.current.querySelector(".btn.danger").focus());
  const saved = isSavedList();
  const name = s.name.trim() || "This list";
  const go = () => { modal.close(); discardChanges(); };
  return (
    <dialog class="modal l-dialog" {...modal.props} aria-labelledby="l-discard-title" aria-describedby="l-discard-text" onClose={() => set({ discarding: false })}>
      <h2 id="l-discard-title">{saved ? "Discard changes?" : "Clear the list?"}</h2>
      <p class="l-leave-text" id="l-discard-text">{saved
        ? `“${name}” goes back to how it was saved. What you changed since is lost.`
        : `“${name}” was never saved, so clearing it leaves nothing behind.`}</p>
      <div class="modal-actions">
        <button type="button" class="btn" onClick={modal.close}>Keep editing</button>
        <button type="button" class="btn danger" onClick={go}>{saved ? "Discard changes" : "Clear the list"}</button>
      </div>
    </dialog>
  );
}

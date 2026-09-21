// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Asks before leaving a list with unsaved changes: for another tab, another saved list or a new one.
// The list on the tab is kept either way; saving is what puts it in Saved.

import { store, set } from "./state.js";
import { save } from "./actions.js";
import { useModal } from "../use-modal.js";

export function LeaveDialog() {
  const s = store.use();
  const modal = useModal(s.leaving, () => modal.ref.current.querySelector(".btn.primary").focus());
  // closes the dialog, then goes where the person was headed
  const leave = () => {
    const go = store.state.leaving;
    modal.close();
    go?.();
  };
  const name = s.name.trim() || "This list";
  return (
    <dialog class="modal l-dialog l-leave" {...modal.props} aria-labelledby="l-leave-title" onClose={() => set({ leaving: null })}>
      <h2 id="l-leave-title">Unsaved changes</h2>
      <p class="l-leave-text">“{name}” has changes that aren't saved. Save it to find it later under Saved.</p>
      <div class="modal-actions">
        <button type="button" class="btn" onClick={modal.close}>Stay</button>
        <button type="button" class="btn" onClick={leave}>Leave without saving</button>
        <button type="button" class="btn primary" onClick={() => { if (save()) leave(); }}>Save and leave</button>
      </div>
    </dialog>
  );
}

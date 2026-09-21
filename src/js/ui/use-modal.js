// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// A <dialog> shown as a modal while `open` is set. `onShow` runs once it's showing, to fill in and
// focus its fields. Spread `props` on the dialog: a click on the dimmed backdrop closes it.

import { useEffect, useRef } from "preact/hooks";
import { onBackdrop } from "./common.js";

export function useModal(open, onShow) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    ref.current.showModal();
    onShow?.();
  }, [open]);
  return {
    ref,
    close: () => ref.current.close(),
    props: { ref, onClick: e => { if (onBackdrop(e)) ref.current.close(); } },
  };
}

// A tab's state: one object, replaced on every change, and a hook that redraws the
// components using it. Each tab keeps one store at module level, so code outside the
// components (searches, timers, other tabs) can read and change it too.

import { useLayoutEffect, useReducer } from "preact/hooks";

// onSet(state, before) runs after every change, before anything redraws
export function createStore(initial, { onSet } = {}) {
  let state = initial;
  const listeners = new Set();
  const store = {
    get state() { return state; },
    // patch is an object merged into the state, or a function of the state returning one
    set(patch) {
      const before = state;
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      onSet?.(state, before);
      for (const f of listeners) f();
    },
    use() {
      const [, redraw] = useReducer(n => n + 1, 0);
      const seen = state;
      // subscribed before the browser paints, and drawn again if the state changed between
      // this render and subscribing, so no change is missed
      useLayoutEffect(() => {
        listeners.add(redraw);
        if (state !== seen) redraw();
        return () => listeners.delete(redraw);
      }, []);
      return state;
    },
  };
  return store;
}

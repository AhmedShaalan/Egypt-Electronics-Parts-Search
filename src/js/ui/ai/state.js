// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The AI tab's state: which app and computer the setup steps are for, and the path to server.js
// the person pasted, which fills in the config.

import { loadText, saveText } from "../storage.js";
import { createStore } from "../store.js";

export const APPS = { code: "Claude Code", desktop: "Claude Desktop", cursor: "Cursor", other: "Other" };
export const OSES = { mac: "Mac", win: "Windows", linux: "Linux" };

// the computer, guessed from the browser until one is picked
function guessOs() {
  const p = navigator.userAgentData?.platform || navigator.platform || "";
  return /Win/i.test(p) ? "win" : /Linux|X11/i.test(p) && !/Android/i.test(navigator.userAgent) ? "linux" : "mac";
}
// the choice made on an earlier visit, if it's still one of the choices
function saved(name, all) {
  const k = loadText(name);
  return k in all ? k : null;
}

export const store = createStore({
  app: saved("ai-app", APPS) ?? "code",
  os: saved("ai-os", OSES) ?? guessOs(),
  path: "",
});
export const { set } = store;

export function setApp(app) {
  saveText("ai-app", app);
  set({ app });
}
export function setOs(os) {
  saveText("ai-os", os);
  set({ os });
}
// quotes around a pasted path are dropped
export const setPath = path => set({ path: path.replace(/^\s*["']|["']\s*$/g, "") });

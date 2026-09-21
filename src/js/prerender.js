// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The tabs that read the same for everyone, as HTML, for the build to write into the page
// (vite.config.js). Search engines and link readers that don't run scripts then see them too.
// Runs in Node while building, never in the browser.

import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { ShopsApp } from "./ui/shops/index.js";
import { AiApp } from "./ui/ai/index.js";
import { AboutApp } from "./ui/about/index.js";

// each tab's HTML, by the id of the element it goes in
export const tabs = () => ({
  "shops-app": renderToString(h(ShopsApp)),
  "ai-app": renderToString(h(AiApp)),
  "about-app": renderToString(h(AboutApp)),
});

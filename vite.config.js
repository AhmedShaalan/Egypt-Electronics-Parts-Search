// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Builds the website in src/ into dist/, which GitHub Pages publishes (see .github/workflows/pages.yml).
// The built files' names carry a hash of their contents, so a browser never mixes a new page with
// old cached scripts. Files in src/public/ are copied as they are.

import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "src",
  // relative, so a fork also works at https://yourname.github.io/<repo-name>/
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // the relay allows localhost on any port; this keeps the one the README uses
  server: { port: 8766, strictPort: true },
  preview: { port: 8766, strictPort: true },
});

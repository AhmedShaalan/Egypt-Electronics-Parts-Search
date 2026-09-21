// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Builds the website in src/ into dist/, which GitHub Pages publishes (see .github/workflows/pages.yml).
// The built files' names carry a hash of their contents, so a browser never mixes a new page with
// old cached scripts. Files in src/public/ are copied as they are.

import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// the site's version, for the About tab
const site = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
// the MCP server's version, and the day it came out from its heading in CHANGELOG.md, for the AI tab
const { version } = JSON.parse(readFileSync(new URL("mcp/package.json", import.meta.url), "utf8"));
const changelog = readFileSync(new URL("CHANGELOG.md", import.meta.url), "utf8");
const released = changelog.match(new RegExp(`^## ${version.replaceAll(".", "\\.")} · (\\d{4}-\\d{2}-\\d{2})`, "m"))?.[1] ?? "";

export default defineConfig({
  root: "src",
  // relative, so a fork also works at https://yourname.github.io/<repo-name>/
  base: "./",
  plugins: [preact()],
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(site.version),
    "import.meta.env.MCP_VERSION": JSON.stringify(version),
    "import.meta.env.MCP_RELEASED": JSON.stringify(released),
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // the relay allows localhost on any port; this keeps the one the README uses
  server: { port: 8766, strictPort: true },
  preview: { port: 8766, strictPort: true },
});

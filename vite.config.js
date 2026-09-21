// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Builds the website in src/ into dist/, which GitHub Pages publishes (see .github/workflows/pages.yml).
// The built files' names carry a hash of their contents, so a browser never mixes a new page with
// old cached scripts. Files in src/public/ are copied as they are.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, defineConfig } from "vite";
import preact from "@preact/preset-vite";

// the site's version, for the About tab
const site = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
// the MCP server's version, and the day it came out from its heading in CHANGELOG.md, for the AI tab
const { version } = JSON.parse(readFileSync(new URL("mcp/package.json", import.meta.url), "utf8"));
const changelog = readFileSync(new URL("CHANGELOG.md", import.meta.url), "utf8");
const released = changelog.match(new RegExp(`^## ${version.replaceAll(".", "\\.")} · (\\d{4}-\\d{2}-\\d{2})`, "m"))?.[1] ?? "";

// The Shops, AI and About tabs read the same for everyone, so the build writes them into the page:
// search engines and link readers that don't run scripts see them too (js/prerender.js). The
// page's scripts then draw them afresh. Also writes the sitemap, dated the day of the build.
function prerender() {
  return {
    name: "prerender-tabs",
    apply: "build",
    async transformIndexHtml(html) {
      const vite = await createServer({
        configFile: fileURLToPath(import.meta.url),
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: "custom",
        logLevel: "error",
      });
      try {
        const { tabs } = await vite.ssrLoadModule("/js/prerender.js");
        for (const [id, body] of Object.entries(tabs())) {
          const empty = `<div id="${id}"></div>`;
          if (!html.includes(empty)) throw new Error(`prerender: no ${empty} in index.html`);
          html = html.replace(empty, () => `<div id="${id}">${body}</div>`);
        }
        return html;
      } finally {
        await vite.close();
      }
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://parts.ahmedshaalan.com/</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
      });
    },
  };
}

export default defineConfig({
  root: "src",
  // relative, so a fork also works at https://yourname.github.io/<repo-name>/
  base: "./",
  plugins: [preact(), prerender()],
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

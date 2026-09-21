# Egypt Parts Search MCP server

Lets an AI assistant (Claude Code, Claude Desktop, or any MCP client) search the 16 Egyptian electronics shops that [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/) covers, and price whole parts lists.

It runs on your own computer over stdio and reuses the site's code in [`../src/js`](../src/js), so results match the site. Shops are asked directly: outside a browser there's no CORS, so the relay isn't needed. No account or key.

```sh
npm install
claude mcp add --scope user egypt-parts -- node "$PWD/server.js"
```

Tools: `search_parts`, `price_parts_list`, `check_price` and `list_shops`. See [the main README](../README.md#use-it-from-claude-or-another-ai-assistant) for details.

Requires Node 20+. Licensed AGPL-3.0-or-later, like the rest of the project.

# Egypt Parts Search MCP server

Lets an AI assistant (Claude Code, Claude Desktop, or any MCP client) search the 17 Egyptian electronics shops that [parts.ahmedshaalan.com](https://parts.ahmedshaalan.com/) covers, and price whole parts lists. Ask things like *"find the cheapest LM7805"* or *"price this parts list"* and paste the list.

It runs on your own computer over stdio and asks the shops directly: outside a browser there's no CORS, so the relay isn't needed. No account, no key, no fee.

## Setting it up

```sh
cd mcp && npm install
claude mcp add --scope user egypt-parts -- node "$PWD/server.js"   # Claude Code
```

For Claude Desktop or another client, add it to the client's MCP config:

```json
{ "mcpServers": { "egypt-parts": { "command": "node", "args": ["/full/path/to/mcp/server.js"] } } }
```

The site's [**AI** tab](https://parts.ahmedshaalan.com/#ai) walks through the same setup step by step.

## The tools

| Tool | What it does |
|---|---|
| `search_parts` | Searches every shop for one part: in-stock products, best match first, then cheapest. Can search only some shops (quicker), and include weak matches. |
| `price_parts_list` | Prices a parts list: the pick per line, the cheapest mix, the cheapest single shop, and what each shop is missing. |
| `check_price` | Re-checks one product's price and stock at its shop. |
| `list_shops` | The shops and the keys the other tools take. |

## Good to know

It runs the site's own code from [`../src/js`](../src/js), so it matches and totals exactly like the site. Needs Node 20 or newer. Searches are cached for an hour while the server runs. Without the relay's shared cache, a shop may briefly rate-limit your connection if you search a lot, and it then shows as failed.

Each version in [the changelog](../CHANGELOG.md) is a git tag, so a copy of this server can be kept on a known version (`git checkout v2.0.0`) or updated with `git pull`.

Licensed AGPL-3.0-or-later, like the rest of the project.

---

More: [the project](../README.md) · [how the search works](../docs/how-it-works.md) · [development](../docs/development.md)

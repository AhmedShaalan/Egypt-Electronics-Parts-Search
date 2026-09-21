// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Setting up the MCP server: the steps for the app and computer picked, and the usual problems.

import { NO_AUTOFILL } from "../common.js";
import { APPS, OSES, setApp, setOs, setPath } from "./state.js";
import { Code, Ok } from "./code.jsx";

const REPO = "https://github.com/AhmedShaalan/Egypt-Electronics-Parts-Search.git";
const EXAMPLE_PATH = {
  mac: "/Users/you/Egypt-Electronics-Parts-Search/mcp/server.js",
  win: "C:\\Users\\you\\Egypt-Electronics-Parts-Search\\mcp\\server.js",
  linux: "/home/you/Egypt-Electronics-Parts-Search/mcp/server.js",
};
const TERMINAL = { mac: "Terminal", win: "PowerShell", linux: "a terminal" };
// where each app keeps its MCP servers
const CONFIG_FILE = {
  desktop: {
    mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
    win: "%APPDATA%\\Claude\\claude_desktop_config.json",
    linux: "~/.config/Claude/claude_desktop_config.json",
  },
  cursor: { mac: "~/.cursor/mcp.json", win: "%USERPROFILE%\\.cursor\\mcp.json", linux: "~/.cursor/mcp.json" },
};
const Menu = ({ children }) => <span class="ai-menu-path">{children}</span>;
const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noopener">{children}</a>;

function Seg({ label, all, value, onPick }) {
  return (
    <div class="ai-picker" role="group" aria-label={label}><span aria-hidden="true">{label}</span>
      <div class="ai-seg">
        {Object.entries(all).map(([k, v]) => <button type="button" key={k} aria-pressed={k === value} onClick={() => onPick(k)}>{v}</button>)}
      </div>
    </div>
  );
}

export const Pickers = ({ s }) => (
  <div class="ai-pickers">
    <Seg label="App" all={APPS} value={s.app} onPick={setApp} />
    <Seg label="Computer" all={OSES} value={s.os} onPick={setOs} />
  </div>
);

// what's wrong with a pasted path, if anything
function pathWarning(path, os) {
  const p = path.trim();
  if (!p) return "";
  if (!/server\.js$/.test(p)) return "This should end in server.js. Run the command above in the mcp folder.";
  if (os === "win" && p.startsWith("/")) return "This looks like a Mac or Linux path. Is Windows the right computer above?";
  if (os !== "win" && /^[A-Za-z]:\\/.test(p)) return "This looks like a Windows path. Pick Windows above.";
  return "";
}

// the steps that add the server to an app that takes a JSON config
function ConfigSteps({ s }) {
  const { app, os } = s;
  const name = app === "other" ? "your app" : APPS[app];
  const file = CONFIG_FILE[app]?.[os];
  const config = JSON.stringify({ mcpServers: { "egypt-parts": { command: "node", args: [s.path.trim() || EXAMPLE_PATH[os]] } } }, null, 2);
  return <>
    <li>
      <h3>Get the full path to the server</h3>
      <p>Your app needs to know exactly where the server is. In the same window, run:</p>
      <Code text={os === "win" ? "Join-Path $PWD server.js" : 'echo "$PWD/server.js"'} />
      <div class="ai-path">
        <label for="ai-path">Paste what it printed</label>
        <input id="ai-path" type="text" spellcheck={false} placeholder={EXAMPLE_PATH[os]} value={s.path}
          onInput={e => setPath(e.currentTarget.value)} {...NO_AUTOFILL} />
        <span class="ai-warn" aria-live="polite">{pathWarning(s.path, os)}</span>
      </div>
    </li>
    <li>
      <h3>Add it to {name}</h3>
      <p>
        {app === "desktop" ? <>In Claude Desktop open <Menu>Settings → Developer → Edit Config</Menu>. That opens the file</>
          : app === "cursor" ? <>In Cursor open its settings, find <Menu>MCP</Menu> (the menu's name changes between versions) and add a new global MCP server. That opens the file</>
          : <>Find where your app adds MCP servers, usually under Settings. Most take the same JSON; if it asks for fields instead, the command is <code>node</code> and the argument is the path above.</>}
        {file ? <> <code>{file}</code>. Replace what's in it with this:</> : null}
      </p>
      <Code text={config} />
      {app === "desktop" && os === "linux" ? <Ok>Claude Desktop for Linux is in beta. If it isn't on your computer, <button class="s-linkbtn" type="button" onClick={() => setApp("code")}>Claude Code</button> works on Linux too.</Ok> : null}
      <div class="ai-callout"><strong>Already has other servers in it?</strong> Don't replace the file. Add only the <code>"egypt-parts": {"{ … }"}</code> part inside <code>"mcpServers"</code>, with a comma after the server before it.</div>
      {os === "win" ? <Ok>The backslashes are doubled on purpose; the file needs them that way.</Ok> : null}
    </li>
    <li>
      <h3>Restart {app === "other" ? "the app" : APPS[app]}</h3>
      <p>{app === "desktop"
        ? <>Quit it fully, {os === "win" ? <>by right-clicking its icon in the taskbar tray and choosing <strong>Quit</strong></>
          : os === "linux" ? <>from its icon in the system tray or its menu</> : <>with <kbd class="ai-kbd">⌘Q</kbd></>}; closing the window isn't enough. Then open it again.</>
        : "Close it and open it again so it reads the new settings."}</p>
      <Ok>{app === "desktop"
        ? <>Worked if <strong>egypt-parts</strong> is listed under the ⚙ button in a new chat, next to your other connectors.</>
        : <>Worked if <strong>egypt-parts</strong> shows in the app's MCP settings with a green dot.</>}</Ok>
    </li>
  </>;
}

export function Steps({ s }) {
  const { app, os } = s;
  const sep = os === "win" ? "\\" : "/";
  const term = TERMINAL[os];
  return (
    <ol class="ai-steps">
      <li>
        <h3>Check you have Node.js and Git</h3>
        <p>Open {term} and run:</p>
        <Code text={"node -v\ngit --version"} />
        <Ok>Worked if Node shows <strong>v20</strong> or higher and Git shows any version. Missing one? Get <Ext href="https://nodejs.org/en/download">Node.js</Ext> or <Ext href="https://git-scm.com/downloads">Git</Ext>, then open a new {term} window and check again.</Ok>
      </li>
      <li>
        <h3>Download it</h3>
        <p>This puts a folder called <code>Egypt-Electronics-Parts-Search</code> where {term} is, and installs what it needs:</p>
        <Code text={`git clone ${REPO}\ncd Egypt-Electronics-Parts-Search${sep}mcp\nnpm install`} />
        <Ok>Worked if the last line says <strong>added … packages</strong>. Keep this window open for the next step.</Ok>
      </li>
      {app === "code"
        ? <li>
            <h3>Add it to Claude Code</h3>
            <p>In the same window, still in the <code>mcp</code> folder:</p>
            <Code text={`claude mcp add --scope user egypt-parts -- node "$PWD${sep}server.js"`} />
            <p>Then check it's there:</p>
            <Code text="claude mcp list" />
            <Code out label="It should print a line like">egypt-parts: node {EXAMPLE_PATH[os]} - <b>✓ Connected</b></Code>
            <Ok><code>--scope user</code> makes it work in every folder, not only this one.</Ok>
          </li>
        : <ConfigSteps s={s} />}
      <li>
        <h3>Try it</h3>
        <p>Start a new chat and ask:</p>
        <Code text="Find the cheapest LM7805" />
        <Ok>Worked if the answer shows it used <strong>search_parts</strong>, and lists shops and prices. The first search takes a few seconds while every shop answers.</Ok>
      </li>
    </ol>
  );
}

export function Trouble({ s }) {
  const { app, os } = s;
  const code = app === "code";
  const term = TERMINAL[os];
  const items = [
    ["The assistant doesn't know about it", code
      ? <p>Run <code>claude mcp list</code>. If egypt-parts isn't there, do step 3 again from the <code>mcp</code> folder. If it says <em>Failed</em>, run <code>node server.js</code> in that folder to see the error.</p>
      : <p>Quit the app fully and open it again; most apps only read the config when they start. Then check the JSON: a missing comma or quote stops the whole file from loading.</p>],
    [os === "win" ? "“node is not recognized”" : "“node: command not found”", <>
      <p>Node.js isn't installed, or the {term} window was opened before it was. Install it, open a new window, and check with <code>node -v</code>.</p>
      {code ? null : <p>If {term} finds it but the app doesn't, put Node's full path in <code>"command"</code>. Get it with <code>{os === "win" ? "(Get-Command node).Source" : "which node"}</code>.</p>}
    </>],
    ["“Cannot find module”", <p><code>npm install</code> didn't run in the <code>mcp</code> folder. Go into it and run it again.</p>],
    ["A shop shows as failed", <p>It didn't answer in time or refused for a moment. The others still count; ask again in a few minutes.</p>],
    ["Update to the latest version", <>
      <p>New shops and fixes come through GitHub. In the <code>Egypt-Electronics-Parts-Search</code> folder run:</p>
      <Code text={"git pull\ncd mcp\nnpm install"} />
      <p>Then restart {code ? "Claude Code" : "the app"}.</p>
    </>],
    ["Remove it", code
      ? <p>Run <code>claude mcp remove egypt-parts --scope user</code>, then delete the folder.</p>
      : <p>Take the <code>"egypt-parts"</code> part out of the config, restart the app, then delete the folder.</p>],
  ];
  // keyed by place, so a question stays open when the app or computer changes its wording
  return (
    <div class="s-qa">
      {items.map(([q, a], i) => <details key={i}><summary>{q}</summary><div class="s-qa-ans">{a}</div></details>)}
    </div>
  );
}

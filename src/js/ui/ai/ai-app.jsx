// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The AI tab: using the search from Claude or another AI assistant through the MCP server in mcp/.
// An example chat shows what it answers, then the setup for the app and computer picked (setup.jsx),
// questions to try, and the usual problems.

import { useRef } from "preact/hooks";
import { SHOPS } from "../../shops.js";
import { AlertIcon, AppsIcon, CheckIcon, ClockIcon, CopyIcon, GithubIcon, LockIcon, PauseIcon, TagIcon, TermIcon, UpIcon } from "../icons.jsx";
import { Toc, useCurrentSection } from "../components.jsx";
import { store } from "./state.js";
import { useCopied } from "./code.jsx";
import { Pickers, Steps, Trouble } from "./setup.jsx";

const MCP_URL = "https://github.com/AhmedShaalan/Egypt-Electronics-Parts-Search/tree/main/mcp";
// the server's version and the day it came out, from mcp/package.json and CHANGELOG.md (vite.config.js)
const VERSION = import.meta.env.MCP_VERSION;
const RELEASED = import.meta.env.MCP_RELEASED;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

const SECTIONS = [["ai-setup", "Set it up"], ["ai-ask", "What you can ask"], ["ai-know", "Good to know"], ["ai-trouble", "Not working?"]];

// the example chat; its prices are made up, and say so
function Demo() {
  return (
    <figure class="ai-demo" aria-label="An example chat">
      <div class="ai-demo-bar"><span class="ai-dots" aria-hidden="true"><i /><i /><i /></span><span>Example chat</span><span class="s-chip soft">sample prices</span></div>
      <div class="ai-demo-body">
        <div class="ai-me">Where's cheapest for 2× LM7805 and an ESP32 DevKit?</div>
        <span class="ai-tool-use"><CheckIcon />Searched {SHOPS.length} shops <code>price_parts_list</code></span>
        <div class="ai-answer">
          <p>Cheapest is to split it between two shops:</p>
          <div class="ai-picks">
            <div class="ai-pick"><span class="ai-pick-part">LM7805 ×2</span><span class="ai-pick-name">L7805CV <span class="ai-at">at RAM Electronics</span></span><span class="ai-pick-price num">15 EGP<small>7.50 each</small></span></div>
            <div class="ai-pick"><span class="ai-pick-part">ESP32 DevKit</span><span class="ai-pick-name">ESP32 DevKit V1, 30-pin <span class="ai-at">at Makers Electronics</span></span><span class="ai-pick-price num">285 EGP</span></div>
            <div class="ai-pick-total"><span>Total from 2 shops</span><span class="num">300 EGP</span></div>
          </div>
          <p class="ai-tip">Rather one delivery? <strong>Makers Electronics</strong> has both for 306 EGP, only 6 EGP more.</p>
        </div>
      </div>
      <div class="ai-demo-input" aria-hidden="true"><span>Reply…</span><i><UpIcon /></i></div>
    </figure>
  );
}

function Hero() {
  return (
    <div class="ai-hero">
      <div>
        <h1>Ask an AI assistant to find your parts</h1>
        <p class="ai-lede">Add this search to Claude or another AI assistant, then ask in plain words. It searches all {SHOPS.length} shops, the same way this site does, and answers with prices, links and totals.</p>
        <ul class="ai-facts">
          <li><CheckIcon />Free</li>
          <li><CheckIcon />No account or key</li>
          <li><CheckIcon />Runs on your computer</li>
        </ul>
        <div class="ai-hero-actions">
          <a class="btn primary" href="#ai-setup">Set it up · about 2 minutes</a>
          <a class="btn" href="#ai-ask">What can I ask?</a>
        </div>
      </div>
      <Demo />
    </div>
  );
}

// a question to try, copied to paste into a chat
function Ask({ title, tool, ask, copyText = ask, children }) {
  const [copied, run] = useCopied();
  return (
    <div class="ai-ask">
      <h3>{title}</h3>
      <p>{children}</p>
      <button class={`ai-try${copied ? " done" : ""}`} type="button" title="Copy" onClick={() => run(copyText, "Question copied; paste it into a new chat")}>
        <span>{ask}</span><span class="ai-copy">{copied ? <CheckIcon /> : <CopyIcon />}</span>
      </button>
      <span class="ai-tool">{tool}</span>
    </div>
  );
}

const Asks = () => (
  <div class="ai-asks">
    <Ask title="Find one part" tool="search_parts" ask="“Find the cheapest LM7805”" copyText="Find the cheapest LM7805">
      In-stock offers from every shop, best match first, then cheapest.</Ask>
    <Ask title="Price a whole list" tool="price_parts_list" ask="“Price this list:” then paste it" copyText={"Price this list:\n2× LM7805\nESP32 DevKit V1\n20× 10k resistor"}>
      Like the Parts list tab: a pick for each part, the cheapest mix of shops, and the cheapest single shop.</Ask>
    <Ask title="Re-check a price" tool="check_price" ask="“Is that ESP32 still in stock at Makers?”" copyText="Is that ESP32 still in stock at Makers?">
      Asks one shop again for a product's price and stock, right now.</Ask>
    <Ask title="See the shops" tool="list_shops" ask="“Which shops do you search?”" copyText="Which shops do you search?">
      The {SHOPS.length} shops it searches, with their websites.</Ask>
  </div>
);

const KNOW = [
  [<LockIcon />, "Nothing passes through this site", "Searches go from your computer straight to the shops."],
  [<ClockIcon />, "Asking again is instant", "Answers are reused for an hour while the assistant is open, which is also easier on the shops."],
  [<AlertIcon />, "Check weak matches before buying", "The assistant is told which results are close and which may be a different part, but it can still get it wrong."],
  [<PauseIcon />, "Searching a lot? Slow down a little", "A shop may briefly refuse many searches in a row. It then shows as failed and comes back after a while."],
];

function Side({ current, pick }) {
  return (
    <aside class="s-side ai-side">
      <div class="s-card ai-card">
        <h2>At a glance</h2>
        <ul class="ai-glance">
          <li><TermIcon /><div>Needs Node.js 20 or newer, and Git<small>Step 1 checks both</small></div></li>
          <li><AppsIcon /><div>Works in Claude Code, Claude Desktop, Cursor and other apps that take MCP servers</div></li>
          {VERSION ? <li><TagIcon /><div>Version {VERSION}{RELEASED ? <small>Updated {day(RELEASED)}</small> : null}</div></li> : null}
        </ul>
        <a class="btn" href={MCP_URL} target="_blank" rel="noopener"><GithubIcon />Source on GitHub</a>
      </div>
      <Toc sections={SECTIONS} current={current} onPick={pick} />
    </aside>
  );
}

export function AiApp() {
  const s = store.use();
  const guide = useRef(null);
  const [current, pick] = useCurrentSection(guide);
  return <>
    <Hero />
    <div class="ai-body">
      <div class="ai-guide" ref={guide}>
        <section id="ai-setup">
          <h2>Set it up</h2>
          <p class="ai-h-sub">Pick your app and your computer, and the steps below change to match.</p>
          <Pickers s={s} />
          <Steps s={s} />
        </section>
        <section id="ai-ask">
          <h2>What you can ask</h2>
          <p class="ai-h-sub">Ask in your own words; these are just to get you going. Tap a question to copy it.</p>
          <Asks />
        </section>
        <section id="ai-know">
          <h2>Good to know</h2>
          <ul class="ai-know">
            {KNOW.map(([icon, title, text]) => <li key={title}><span class="ai-ic">{icon}</span><div><strong>{title}</strong><span>{text}</span></div></li>)}
          </ul>
        </section>
        <section id="ai-trouble">
          <h2>Not working?</h2>
          <p class="ai-h-sub">The usual problems and their fixes, most common first.</p>
          <Trouble s={s} />
        </section>
      </div>
      <Side current={current} pick={pick} />
    </div>
  </>;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// The About tab: why the site exists, how a search runs, what's kept and counted, what it can't
// do, common questions, terms of use, and credits.

import { useRef } from "preact/hooks";
import { SHOPS } from "../../shops.js";
import { cartShop } from "../cart.js";
import { Toc, useCurrentSection } from "../components.jsx";
import { BugIcon, CartIcon, ChartIcon, DeviceIcon, GithubIcon, OpenIcon, PlusIcon, RelayIcon, UserIcon, WebIcon } from "../icons.jsx";

const REPO = "https://github.com/AhmedShaalan/Egypt-Electronics-Parts-Search";
const NEW_ISSUE = `${REPO}/issues/new`;
const SUGGEST_URL = `${NEW_ISSUE}?title=${encodeURIComponent("Add a shop: ")}`;
const VERSION = import.meta.env.APP_VERSION;
const N = SHOPS.length;
const CARTS = SHOPS.filter(s => cartShop(s.key)).length;
// the shops browsers may read directly: the two on Shopify, El Gammal, MTM and VoltX; Electra
// only for its catalog, its prices and stock come through the relay (shops.js)
const DIRECT = 5;

const SECTIONS = [
  ["about-why", "Why it exists"], ["about-how", "How it works"], ["about-privacy", "Your privacy"],
  ["about-limits", "What it can't do"], ["about-faq", "Common questions"], ["about-terms", "Terms of use"], ["about-credits", "Credits"],
];

const Ext = ({ href, children }) => <a href={href} target="_blank" rel="noopener">{children}</a>;

function Hero() {
  return (
    <div class="ab-hero">
      <p class="ab-eyebrow">About</p>
      <h1>One search box for Egypt's electronic-parts shops</h1>
      <p class="ab-lede">Type a part and it asks {N} Egyptian shops at the same time, then shows what's in stock, cheapest first, with a link straight to each shop. It's free, needs no account, and isn't run by any shop.</p>
      <ul class="ab-facts">
        <li>{N} shops</li><li>Live prices</li><li>In-stock only</li><li>Free, no sign-up</li><li>Open source</li>
      </ul>
    </div>
  );
}

// three shops' names for one part, merged into one result; the prices are made up, and say so
function Names() {
  return <>
    <div class="ab-names" role="img" aria-label="Three shop names for the same part become one result">
      <div class="ab-names-in">
        <div class="ab-nm"><code>LM7805</code><span>Makers</span></div>
        <div class="ab-nm"><code>L7805CV</code><span>RAM</span></div>
        <div class="ab-nm"><code>7805 Regulator 5V</code><span>Future</span></div>
      </div>
      <div class="ab-arrow" aria-hidden="true"><OpenIcon /></div>
      <div class="ab-merged">
        <b>LM7805 5V regulator</b>
        <div class="ab-m-meta">TO-220 · in stock at 3 shops</div>
        <div class="ab-m-row"><span>RAM Electronics</span><span class="num">7.50 EGP</span></div>
        <div class="ab-m-row"><span>Makers Electronics</span><span class="num">8 EGP</span></div>
        <div class="ab-m-row"><span>Future Electronics</span><span class="num">9.50 EGP</span></div>
      </div>
    </div>
    <p class="ab-cap">Sample prices.</p>
  </>;
}

const FLOW = [
  ["Asks every shop", `All ${N} at the same time. Results show as they answer; a shop that takes over 25 seconds is marked failed.`],
  ["Tries other spellings", "“12 V 2 A” is also searched as “12v 2a”, and “LM7805” as “7805”, since shop search boxes are literal."],
  ["Scores every name", "Each product is scored against what you typed. Close matches show first, weaker ones say why, the rest are dropped."],
  ["Keeps what you can buy", "Out-of-stock and zero-price items go; the rest is sorted by match, then price."],
];

const PRIVACY = [
  [<UserIcon />, "No account, no cookies", "There is nothing to sign in to."],
  [<DeviceIcon />, "Saved items stay in this browser", "Starred items, parts lists and delivery fees never leave it. Use Back up on the Saved tab to keep a copy."],
  [<ChartIcon />, "Anonymous visit counts", "Cloudflare Web Analytics counts page views without cookies or following anyone. What you search for isn't sent to it."],
  [<CartIcon />, "Carts are the shops' own", "Add to cart opens the shop's site, which keeps the cart just as when you shop there directly."],
];

const LIMITS = [
  ["Matching is a best guess", "Part numbers work well. Vague names like “LCD” or “sensor” need a glance, and an accessory can still pass as a match."],
  ["Delivery fees are your own estimates", "Shops don't publish them in a way the site can read, so the parts list counts the fees you enter."],
  [`Add to cart works at ${CARTS} of the ${N} shops`, "And not for products with options to choose. The cart shows the shop's current price."],
  ["Shops that sell only on Facebook or WhatsApp aren't covered", "They have no online store to search."],
  ["Saved items don't sync", "They're kept per browser. Back up and Restore on the Saved tab move them to another one."],
];

const FAQ = [
  ["Where can I buy electronic components in Egypt?", <p>The {N} shops on the <a href="#shops">Shops</a> tab all sell online and deliver across Egypt. Search a part here to see which of them have it in stock right now, and at what price.</p>],
  ["Which shop is cheapest?", <p>It changes from part to part, which is why this exists: search once and the cheapest is on top. For a whole project, the <a href="#list">Parts list</a> works out which shops to buy from, delivery included.</p>],
  ["Do I buy through this site?", <p>No. Every result links to the shop's own page, and you order and pay there. On the Parts list tab, “Fill cart” opens a shop with your parts already in its cart, for the shops that allow it; checkout, payment and delivery are between you and the shop.</p>],
  ["Are the prices live?", <p>Yes, every search asks the shops' own sites. Answers are reused for up to an hour at two steps, so a price can be up to about two hours old. The shop's site always has the final price.</p>],
  ["Why is a price different on the shop's site?", <p>The shop changed it since it was last asked, or it's a pack price shown here per piece. Open the link to see the shop's own page.</p>],
  ["Why isn't my favourite shop here?", <p>It needs an online store that shows prices and stock. If it has one, <Ext href={SUGGEST_URL}>suggest it</Ext> and I'll add it.</p>],
  ["A shop says “failed”. What happened?", <p>It didn't answer in time, blocked the request, or changed its site. The other shops still count. Try again in a few minutes; if it keeps failing, <Ext href={NEW_ISSUE}>let me know</Ext>.</p>],
  ["Is it free?", <p>Yes, and open source. There are no ads and no account, and the shops don't pay to be listed.</p>],
  ["Can I use it from an AI assistant?", <p>Yes. The <a href="#ai">AI</a> tab sets it up in Claude or another assistant in about two minutes.</p>],
];

const TERMS = [
  ["Prices and stock are for information only", "They come from the shops' sites and can be out of date by up to about two hours. The shop's own site is always final."],
  ["Check the part before you buy", "Results are matched automatically and can be wrong, especially for weaker matches and vague names."],
  ["You buy from the shop, not from this site", "The shop handles your order, payment, delivery, warranty and returns. This site never sees or takes part in them."],
  ["Not affiliated with any shop", "Shop names and product pictures belong to their owners and are shown only to link to them. No shop pays to be listed or ranked."],
  ["Shops can ask to be removed or corrected", <><Ext href={NEW_ISSUE}>Get in touch</Ext> and it's done promptly.</>],
  ["Provided as-is", "The site is free, with no promise that it's always available, complete or accurate, and no responsibility for decisions made using it."],
];
// change it with the terms
const TERMS_UPDATED = "22 September 2026";

const CREDITS = [
  ["App icon", "https://icons8.com/icon/set/transistor/color", "Transistor by Icons8"],
  ["Built with", "https://preactjs.com", "Preact"],
  ["Bundled with", "https://vite.dev", "Vite"],
  ["Hosted on", "https://pages.github.com", "GitHub Pages"],
  ["Relay runs on", "https://workers.cloudflare.com", "Cloudflare Workers"],
  ["AI tab uses", "https://modelcontextprotocol.io", "Model Context Protocol"],
];

const LINKS = [
  [<WebIcon />, "https://ahmedshaalan.com", "ahmedshaalan.com"],
  [<GithubIcon />, REPO, "Source on GitHub"],
  [<BugIcon />, NEW_ISSUE, "Report a problem"],
  [<PlusIcon />, SUGGEST_URL, "Suggest a shop"],
];

function Side({ current, pick }) {
  return (
    <aside class="s-side">
      <div class="s-card">
        <h2>Made by</h2>
        <div class="ab-maker"><img class="ab-avatar" src="avatar.jpg" alt="" width="44" height="44" /><div><b>Ahmed Shaalan</b><small>Not affiliated with any shop</small></div></div>
        <ul class="ab-links">
          {LINKS.map(([icon, href, label]) => <li key={label}><a href={href} target="_blank" rel="noopener">{icon}{label}</a></li>)}
        </ul>
        {VERSION ? <div class="ab-ver"><b>Version {VERSION}</b><Ext href={`${REPO}/blob/main/CHANGELOG.md`}>What's new</Ext></div> : null}
      </div>
      <Toc sections={SECTIONS} current={current} onPick={pick} />
    </aside>
  );
}

export function AboutApp() {
  const doc = useRef(null);
  const [current, pick] = useCurrentSection(doc);
  return <>
    <Hero />
    <div class="ab-body">
      <div class="ab-doc" ref={doc}>
        <section id="about-why" class="ab-prose">
          <h2>Why it exists</h2>
          <p>Buying parts in Egypt used to mean opening RAM, Makers, Future, UGE and half a dozen other tabs, typing the same part number into each, and hoping it was really in stock.</p>
          <p>Worse, every shop names the same part differently, and their own search boxes rarely treat those names as the same thing. This site does:</p>
          <Names />
        </section>

        <section id="about-how">
          <h2>How it works</h2>
          <p class="ab-h-sub">Everything runs in your browser. Apart from a small relay (below), the site has no server of its own, and no database.</p>
          <ol class="ab-flow">
            {FLOW.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
          </ol>
          <div class="ab-relay">
            <span class="ab-ic"><RelayIcon /></span>
            <strong>Why some searches go through a relay</strong>
            <span>Browsers only let a site read another site if it allows it. {DIRECT} shops do, and Electra does for its catalog; for the other {N - DIRECT - 1}, and Electra's prices and stock, a small relay on Cloudflare fetches the shop's page and hands it back. It keeps the shops' answers for an hour, but not who asked, so the shops aren't asked the same thing again and again.</span>
          </div>
        </section>

        <section id="about-privacy">
          <h2>Your privacy</h2>
          <p class="ab-h-sub">The short version: there's nothing to sign up for, and what you save stays on your device.</p>
          <div class="ab-tiles">
            {PRIVACY.map(([icon, title, text]) => <div class="ab-tile" key={title}><span class="ab-ic">{icon}</span><strong>{title}</strong><span>{text}</span></div>)}
          </div>
        </section>

        <section id="about-limits">
          <h2>What it can't do (yet)</h2>
          <p class="ab-h-sub">Worth knowing before you order.</p>
          <ul class="ab-limits">
            {LIMITS.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
          </ul>
        </section>

        <section id="about-faq">
          <h2>Common questions</h2>
          <p class="ab-h-sub">Something else? <Ext href={NEW_ISSUE}>Ask on GitHub</Ext>.</p>
          <div class="s-qa">
            {FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><div class="s-qa-ans">{a}</div></details>)}
          </div>
        </section>

        <section id="about-terms">
          <h2>Terms of use</h2>
          <p class="ab-h-sub">By using the site you accept these. They're short on purpose.</p>
          <ol class="ab-terms">
            {TERMS.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
          </ol>
          <p class="ab-updated">Last updated {TERMS_UPDATED}.</p>
        </section>

        <section id="about-credits">
          <h2>Credits</h2>
          <p class="ab-h-sub">Prices, stock and product pictures belong to the shops and come from their own sites.</p>
          <ul class="ab-credits">
            {CREDITS.map(([what, href, name]) => <li key={what}><span>{what}</span><Ext href={href}>{name}</Ext></li>)}
          </ul>
        </section>
      </div>
      <Side current={current} pick={pick} />
    </div>
  </>;
}

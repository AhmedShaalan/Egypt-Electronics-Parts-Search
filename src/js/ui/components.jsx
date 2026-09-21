// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Pieces more than one tab shares.

import { Component, h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { safeUrl } from "./common.js";
import { DotsIcon } from "./icons.jsx";

// A component drawn again only when one of its props changed, for the parts of a long list.
// preact/compat has one, but it changes how every form field's events work, so it isn't used.
export function memo(Comp) {
  return class Memo extends Component {
    shouldComponentUpdate(next) {
      const now = this.props;
      return Object.keys(next).some(k => next[k] !== now[k]) || Object.keys(now).some(k => !(k in next));
    }
    render(props) { return h(Comp, props); }
  };
}

// a product's picture, or an empty square when it has none or it doesn't load. `class` is the
// tab's size for it (s-thumb, v-thumb, l-thumb). A row can show another product later, so only
// the picture that failed is left out.
export function Thumb({ p, big, class: cls }) {
  const [failed, setFailed] = useState(null);
  const src = p.image && safeUrl(p.image) !== "#" && failed !== p.image ? p.image : null;
  const c = `${cls}${big ? " big" : ""}`;
  return src
    ? <img class={c} src={src} alt="" loading="lazy" referrerpolicy="no-referrer" onError={() => setFailed(src)} />
    : <span class={c} />;
}

// A menu that drops down from its button: ⋯ unless `summary` is given. Choosing an item closes
// it; the arrow keys, Escape and clicking elsewhere are handled for every details.menu (copy.js).
export function Menu({ label, summary, class: cls = "", children }) {
  return (
    <details class={`menu right s-menu ${cls}`.trim()} onToggle={e => { if (e.currentTarget.open) keepOnScreen(e.currentTarget.querySelector(".menu-list")); }}
      onClick={e => { if (e.target.closest('[role="menuitem"]')) e.currentTarget.open = false; }}>
      {summary ?? <summary class="s-icon" title="More" aria-label={label}><DotsIcon /></summary>}
      <div class="menu-list" role="menu">{children}</div>
    </details>
  );
}

// moves an open menu sideways as far as it takes to stay 8px inside the screen, since where its
// button is changes as the page narrows
function keepOnScreen(list) {
  list.style.translate = "";
  const { left, right } = list.getBoundingClientRect();
  const room = document.documentElement.clientWidth - 8;
  const by = left < 8 ? 8 - left : right > room ? Math.max(room - right, 8 - left) : 0;
  if (by) list.style.translate = `${by}px 0`;
}

// A number box that keeps what's being typed while the page redraws around it. Numbers are held
// to min..max: `onValue` gets each one typed, `onCommit` the final one once, when the box is left
// or Enter is pressed, and the box then shows the number kept.
export function NumField({ value, onValue, onCommit, min = -Infinity, max = Infinity, ...props }) {
  const [text, setText] = useState(String(value));
  const el = useRef(null);
  const committed = useRef(value);
  useEffect(() => { committed.current = value; if (document.activeElement !== el.current) setText(String(value)); }, [value]);
  const clamp = t => { const n = parseInt(t, 10); return Number.isNaN(n) ? null : Math.min(max, Math.max(min, n)); };
  const commit = () => {
    const n = clamp(text) ?? value;
    setText(String(n));
    if (n !== committed.current) { committed.current = n; onCommit?.(n); }
  };
  return (
    <input {...props} ref={el} type="number" inputmode="numeric" min={min} max={max} value={text}
      onInput={e => { setText(e.currentTarget.value); const n = clamp(e.currentTarget.value); if (n != null) onValue?.(n); }}
      onKeyDown={e => { if (e.key === "Enter") commit(); }} onBlur={commit} />
  );
}

// The section of a long page being read: the last whose top has reached the top fifth of the
// screen, or the last section once the page is scrolled to the end, since a short one may never
// get that high. A section picked from the contents stays marked until it has been on screen
// and left it. `page` holds the sections. Gives the section, and the function that picks one.
export function useCurrentSection(page) {
  const [current, setCurrent] = useState(null);
  const picked = useRef(null);
  useEffect(() => {
    const sections = [...page.current.querySelectorAll(":scope > section")];
    const update = () => {
      if (!page.current.offsetParent) return; // its tab isn't shown
      const p = picked.current;
      if (p) {
        const r = p.el.getBoundingClientRect();
        const onScreen = r.top < innerHeight && r.bottom > 0;
        if (onScreen || !p.seen) { p.seen ||= onScreen; setCurrent(p.el.id); return; }
        picked.current = null;
      }
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      const reached = sections.filter(el => el.getBoundingClientRect().top <= innerHeight * 0.2);
      setCurrent((atEnd ? sections.at(-1) : reached.at(-1) ?? sections[0]).id);
    };
    // an address that goes straight to a section marks it, like picking it from the contents
    const fromAddress = () => {
      const el = sections.find(x => `#${x.id}` === location.hash);
      if (el) picked.current = { el, seen: false };
      update();
    };
    fromAddress();
    addEventListener("hashchange", fromAddress);
    addEventListener("scroll", update, { passive: true });
    // also when its tab is shown, which changes its size from nothing
    const shown = new ResizeObserver(update);
    shown.observe(page.current);
    return () => { removeEventListener("hashchange", fromAddress); removeEventListener("scroll", update); shown.disconnect(); };
  }, []);
  const pick = id => { picked.current = { el: document.getElementById(id), seen: false }; setCurrent(id); };
  return [current, pick];
}

// The contents of a long page, for beside it, marking the section being read. `sections` are
// [id, label]; `onPick` gets the id of the one clicked.
export function Toc({ sections, current, onPick }) {
  return (
    <nav class="s-card s-toc-card" aria-label="On this page">
      <h2>On this page</h2>
      <ul class="s-toc">
        {sections.map(([id, label]) => (
          <li key={id}><a href={`#${id}`} class={current === id ? "on" : null} aria-current={current === id ? "true" : null}
            onClick={() => onPick?.(id)}>{label}</a></li>
        ))}
      </ul>
    </nav>
  );
}

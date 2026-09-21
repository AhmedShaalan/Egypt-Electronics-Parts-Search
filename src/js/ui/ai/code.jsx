// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Commands and config on the AI tab, each with a button that copies it, and what "done" looks like.

import { useEffect, useRef, useState } from "preact/hooks";
import { copy } from "../copy.js";
import { CheckIcon, CopyIcon } from "../icons.jsx";

// shows a tick for a moment once copied
export function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async (text, done) => {
    if (!(await copy(text, done))) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return [copied, run];
}

function CopyButton({ text }) {
  const [copied, run] = useCopied();
  return (
    <button class={`ai-copy${copied ? " done" : ""}`} type="button" title="Copy" aria-label="Copy" onClick={() => run(text)}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// a command or config to copy; `out` is what a command prints, to compare with, so it has no button
export function Code({ text, label, out, children }) {
  return <>
    {label ? <span class="ai-code-label">{label}</span> : null}
    <div class={`ai-code${out ? " out" : ""}`}>
      <pre><code>{children ?? text}</code></pre>
      {out ? null : <CopyButton text={text} />}
    </div>
  </>;
}

// what a step looks like once it worked
export const Ok = ({ children }) => <p class="ai-ok"><CheckIcon /><span>{children}</span></p>;

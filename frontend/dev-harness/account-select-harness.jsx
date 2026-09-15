/**
 * THROWAWAY debug harness — reproduces the phone-version transaction account search
 * (`frontend/src/pages/transaction/components/AccountSelect.jsx`) in isolation.
 * Delete this folder when the bug is fixed.
 */
import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import AccountSelect from "../src/pages/transaction/components/AccountSelect.jsx";

const params = new URLSearchParams(location.search);
const N = Math.max(1, Number(params.get("n") || 5000));

const NAME_POOL = [
  "CASH",
  "BANK",
  "PLAYER",
  "AGENT",
  "HOUSE",
  "PROFIT",
  "LOSS",
  "COMMISSION",
  "BONUS",
  "RESERVE",
];

function buildAccounts(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const code = String(1001 + i);
    const name = `${NAME_POOL[i % NAME_POOL.length]}_${i}`;
    rows.push({
      id: String(i + 1),
      account_id: code,
      name,
      display_text: `${code} (${name})`,
      role: i % 3 === 0 ? "PLAYER" : "HOUSE",
      currency: "MYR",
      status: "active",
    });
  }
  return rows;
}

/* Same matching rule the component uses, computed independently for assertions.
   Cached: rebuilding the mock list inside snapshot() would pollute the perf numbers. */
let cachedRows = null;
let cachedIndex = null;

function accountsFor() {
  if (!cachedRows) cachedRows = buildAccounts(N);
  return cachedRows;
}

function searchIndex() {
  if (!cachedIndex) {
    cachedIndex = accountsFor().map((row) => ({
      row,
      hay: String(row.display_text || "").toUpperCase(),
    }));
  }
  return cachedIndex;
}

function expectedMatches(query) {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return accountsFor();
  return searchIndex()
    .filter((entry) => entry.hay.includes(q))
    .map((entry) => entry.row);
}

const perfState = {
  frames: [],
  longTasks: [],
  listUpdates: [],
  resetAt: 0,
};

(function trackFrames() {
  let last = performance.now();
  const tick = (t) => {
    perfState.frames.push({ t, gap: t - last });
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      perfState.longTasks.push({ t: entry.startTime, start: entry.startTime, duration: entry.duration });
    }
  }).observe({ entryTypes: ["longtask"] });
} catch {
  /* longtask unsupported */
}

function Harness() {
  const options = useMemo(() => accountsFor(), []);
  const [value, setValue] = useState(null);

  const onChange = useCallback((opt) => setValue(opt), []);

  return (
    <div className="harness-shell">
      <div className="transaction-add-section">
        <div className="transaction-form-group transaction-inline-row">
          <label className="transaction-label">Account</label>
          <div className="transaction-account-inputs">
            <AccountSelect
              ariaLabel="To Account"
              placeholder="Select account"
              options={options}
              value={value}
              onChange={onChange}
              selectedCategories={[]}
              searchPlaceholder="Search account..."
            />
          </div>
        </div>
      </div>
      <div id="harness-marker" data-n={N} />
      {/* CSS probe: the shared select-unified.css rule must uppercase any .custom-select-search input
          (the process / bank / formula pickers rely on it now that their value is not rewritten). */}
      <div className="custom-select-search" id="css-probe" aria-hidden="true" style={{ display: "none" }}>
        <input type="text" readOnly defaultValue="probe" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);

/* ── instrumentation surface for the CDP driver ── */
function searchInput() {
  // Scope to the dropdown: the component may portal it to <body>, and the CSS probe is a
  // .custom-select-search input too.
  return document.querySelector(".custom-select-dropdown .custom-select-search input");
}

function optionNodes() {
  return Array.from(document.querySelectorAll(".custom-select-option"));
}

let lastInputTs = 0;
let observerAttached = false;

function attachListObserver() {
  const listEl = document.querySelector(".custom-select-options");
  if (!listEl || observerAttached) return;
  observerAttached = true;
  new MutationObserver(() => {
    if (!lastInputTs) return;
    perfState.listUpdates.push({
      t: performance.now(),
      latency: performance.now() - lastInputTs,
      nodes: optionNodes().length,
    });
    lastInputTs = 0;
  }).observe(listEl, { childList: true, subtree: true });
}

function summarize() {
  const since = perfState.resetAt;
  const frames = perfState.frames.filter((f) => f.t >= since);
  const longTasks = perfState.longTasks.filter((e) => e.t >= since);
  const listUpdates = perfState.listUpdates.filter((e) => e.t >= since);
  const maxFrameGap = frames.length ? Math.max(...frames.map((f) => f.gap)) : 0;
  const maxLongTask = longTasks.reduce((m, e) => Math.max(m, e.duration), 0);
  const maxListLatency = listUpdates.reduce((m, e) => Math.max(m, e.latency), 0);
  return {
    maxFrameGap,
    maxLongTask,
    maxListLatency,
    totalLongTask: longTasks.reduce((s, e) => s + e.duration, 0),
    totalFrameGap: frames.reduce((s, f) => s + (f.gap > 50 ? f.gap : 0), 0),
    frameCount: frames.length,
    longTaskCount: longTasks.length,
    longTasks: longTasks.map((e) => ({ start: Math.round(e.start), dur: Math.round(e.duration) })),
    listUpdateCount: listUpdates.length,
  };
}

window.__harness = {
  get ready() {
    // The dropdown mounts only while open (portal), so readiness keys off the trigger.
    return !!document.querySelector(".custom-select-button");
  },
  n: N,
  snapshot() {
    const input = searchInput();
    const nodes = optionNodes();
    const text = input ? input.value : null;
    const expectedTexts = expectedMatches(text).map((r) => r.display_text);
    const renderedTexts = nodes.map((n) => n.textContent);
    const btn = document.querySelector(".custom-select-button");
    return {
      value: text,
      rendered: nodes.length,
      expected: expectedTexts.length,
      first: renderedTexts[0] ?? null,
      last: renderedTexts.length ? renderedTexts[renderedTexts.length - 1] : null,
      renderedTexts: renderedTexts.slice(0, 40),
      expectedTexts: expectedTexts.slice(0, 40),
      /** windowed rendering must always show a contiguous prefix of the match set */
      prefixMatches: renderedTexts
        .slice(0, 40)
        .every((t, i) => t === expectedTexts[i]),
      focused: document.activeElement === input,
      noResults: !!document.querySelector(".custom-select-no-results"),
      buttonText: btn ? btn.textContent : null,
      dropdownOpen: !!document.querySelector(".custom-select-dropdown.show"),
    };
  },
  scrollOptionsToEnd() {
    const el = document.querySelector(".custom-select-options");
    if (!el) return false;
    el.scrollTop = el.scrollHeight;
    return true;
  },
  highlight() {
    const el = document.querySelector(".custom-select-option.keyboard-focus");
    return el ? { idx: Number(el.dataset.kbIdx), text: el.textContent } : null;
  },
  probeTextTransform() {
    const probe = document.querySelector("#css-probe input");
    return probe ? getComputedStyle(probe).textTransform : null;
  },
  /** Cheap readiness probes — snapshot() is too heavy to poll while measuring. */
  optionCount() {
    return document.querySelectorAll(".custom-select-option").length;
  },
  isFocused() {
    return document.activeElement === searchInput();
  },
  transforms() {
    return {
      input: searchInput() ? getComputedStyle(searchInput()).textTransform : null,
      probe: document.querySelector("#css-probe input")
        ? getComputedStyle(document.querySelector("#css-probe input")).textTransform
        : null,
    };
  },
  metrics: summarize,
  resetMetrics() {
    perfState.frames.length = 0;
    perfState.longTasks.length = 0;
    perfState.listUpdates.length = 0;
    perfState.resetAt = performance.now();
  },
  attachListObserver,
  /** Deterministic fallback: synthetic IME sequence (compositionstart → input(isComposing)). */
  simulateComposition(text, { commit = false } = {}) {
    const input = searchInput();
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    lastInputTs = performance.now();
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    setter.call(input, text);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        isComposing: true,
        data: text,
        inputType: "insertCompositionText",
      }),
    );
    input.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: text }));
    if (commit) {
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
    }
    return true;
  },
  markInputTs() {
    lastInputTs = performance.now();
  },
  /** Reset/seed the query without touching the IME path (perf scenario setup). */
  setQuery(text) {
    const input = searchInput();
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    setter.call(input, text ?? "");
    lastInputTs = performance.now();
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: text ?? "", inputType: "insertText" }),
    );
    return true;
  },
};

setTimeout(attachListObserver, 300);

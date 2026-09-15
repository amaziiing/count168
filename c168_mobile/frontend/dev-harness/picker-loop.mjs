/**
 * Dev-only CDP loop for the mobile add-transaction account picker.
 *
 *   node dev-harness/picker-loop.mjs --n=2000 --throttle=10
 *
 * Drives the real `AddTransactionSheet` → AccountPicker in a phone-sized headless Chromium:
 *   A) IME / word-mode typing  → search must filter and must not be rewritten
 *   B) delete after filtering  → jank must not grow with the account count
 *   C) opening the picker      → must not freeze while mounting the list
 * Zero dependencies: launches Chrome directly and talks CDP over the Node WebSocket.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  }),
);

const N = Number(argv.n || 2000);
const FLOOR_N = Number(argv.floorN || 30);
const THROTTLE = Number(argv.throttle || 10);
const BASE = String(argv.url || "http://localhost:5200/dev-harness/account-picker.html");
const FRAME_GAP_BUDGET_MS = Number(argv.budget || 120 + 30 * THROTTLE);
const CHROME =
  process.env.CHROME_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "ms-playwright/chromium-1228/chrome-win64/chrome.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 30000, interval = 100, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)})`);
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`chrome not found at ${CHROME}`);

  const port = 9800 + Math.floor(Math.random() * 200);
  const profile = mkdtempSync(path.join(tmpdir(), "picker-harness-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=390,844",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let ws;
  const cleanup = async () => {
    try {
      ws?.close();
    } catch {}
    try {
      chrome.kill();
    } catch {}
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(chrome.pid)], { stdio: "ignore" });
    } catch {}
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  };

  try {
    await waitFor(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
        } catch {
          return false;
        }
      },
      { label: "devtools endpoint", timeout: 25000 },
    );

    const target = await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
    ).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${JSON.stringify(msg.error.data ?? "")}`));
        else resolve(msg.result);
      }
    });
    const send = (method, params = {}) => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };
    const evalInPage = async (expression) => {
      const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || "page eval failed");
      return res.result.value;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

    const results = { n: N, throttle: THROTTLE, checks: [] };
    const record = (name, pass, detail) => results.checks.push({ name, pass, ...detail });

    const loadHarness = async (n) => {
      await send("Page.navigate", { url: `${BASE}?n=${n}` });
      await waitFor(() => evalInPage("!!(window.__harness && window.__harness.ready)"), {
        label: "harness ready",
      });
    };

    /** Open the picker the way a user does: tap the account trigger. */
    const openPicker = async ({ measure = false } = {}) => {
      const box = await evalInPage(
        `(() => { const el = document.querySelector('.m-tx-account-trigger'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`,
      );
      if (measure) await evalInPage("window.__harness.resetMetrics(); true");
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
      await waitFor(async () => (await evalInPage("window.__harness.snapshot()")).pickerOpen, {
        label: "picker open",
        timeout: 20000,
      });
      await waitFor(async () => (await evalInPage("window.__harness.snapshot()")).rendered > 0, {
        label: "picker list rendered",
        timeout: 60000,
      });
      await sleep(400);
      return evalInPage("window.__harness.metrics()");
    };

    const keyEvent = async (key, code, vk) => {
      for (const type of ["rawKeyDown", "keyUp"]) {
        await send("Input.dispatchKeyEvent", {
          type,
          windowsVirtualKeyCode: vk,
          nativeVirtualKeyCode: vk,
          key,
          code,
        });
      }
    };
    const setQuery = async (text) => {
      await evalInPage("window.__harness.setQuery(''); true");
      if (text) await send("Input.insertText", { text });
      await sleep(500);
    };

    const measureDeletePhase = async () => {
      await setQuery("10015");
      const narrowed = await evalInPage("window.__harness.snapshot()");
      await evalInPage("window.__harness.resetMetrics(); true");
      for (let i = 0; i < 5; i += 1) {
        await keyEvent("Backspace", "Backspace", 8);
        await sleep(300);
      }
      await sleep(800);
      const expanded = await evalInPage("window.__harness.snapshot()");
      const metrics = await evalInPage("window.__harness.metrics()");
      return { narrowed, expanded, metrics };
    };

    await loadHarness(N);

    /* ── C) opening the picker must not freeze the sheet ── */
    const openMetrics = await openPicker({ measure: true });
    const opened = await evalInPage("window.__harness.snapshot()");
    record(
      "open: mounting the picker shows a page of the list, not every account",
      opened.rendered > 0 && opened.rendered < opened.expected,
      { renderedOnOpen: opened.rendered, expectedOnOpen: opened.expected },
    );

    /* ── A) IME composition (Chinese / word-mode keyboard path) ── */
    const compose = async (text) => {
      await send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await sleep(300);
      return evalInPage("window.__harness.snapshot()");
    };

    const composedDigits = await compose("2135");
    record(
      "ime: list filters while composing (no delete needed)",
      composedDigits.expected > 0 && composedDigits.rendered > 0 && composedDigits.prefixMatches,
      { rendered: composedDigits.rendered, expected: composedDigits.expected, value: composedDigits.value },
    );

    await send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
    const composedLetter = await compose("c");
    record("ime: typing is not rewritten in the DOM", composedLetter.value === "c", {
      value: composedLetter.value,
    });
    const composedWord = await compose("ca");
    record("ime: typing survives the next keystroke", composedWord.value === "ca", {
      value: composedWord.value,
    });
    await send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });

    await evalInPage("window.__harness.setQuery(''); window.__harness.simulateComposition('2135', { commit: true }); true");
    await sleep(300);
    const synth = await evalInPage("window.__harness.snapshot()");
    record(
      "ime(synthetic): option list filters on composed text",
      synth.expected > 0 && synth.rendered > 0 && synth.prefixMatches,
      { rendered: synth.rendered, expected: synth.expected, value: synth.value },
    );

    /* ── B) delete after filtering ── */
    const scenario = await measureDeletePhase();
    record(
      "delete: list re-expands to the full match set",
      scenario.expanded.expected === N && scenario.expanded.prefixMatches,
      {
        rendered: scenario.expanded.rendered,
        expected: scenario.expanded.expected,
        narrowedRendered: scenario.narrowed.rendered,
      },
    );
    record(
      `delete: max frame gap under ${Math.round(FRAME_GAP_BUDGET_MS)}ms (phone CPU x${THROTTLE})`,
      scenario.metrics.maxFrameGap < FRAME_GAP_BUDGET_MS,
      {
        maxFrameGap: Math.round(scenario.metrics.maxFrameGap),
        maxLongTask: Math.round(scenario.metrics.maxLongTask),
      },
    );

    /* ── selection still works ── */
    await setQuery("");
    const secondBox = await evalInPage(
      `(() => { const nodes = document.querySelectorAll('.m-tx-account-picker-item'); const el = nodes[1]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: el.textContent }; })()`,
    );
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: secondBox.x,
        y: secondBox.y,
        button: "left",
        clickCount: 1,
      });
    }
    await sleep(500);
    const picked = await evalInPage(
      "(() => { const el = document.querySelector('.m-tx-account-trigger-text'); return el ? el.textContent : null; })()",
    );
    record("pick: tapping an account selects it and closes the picker", picked === secondBox.text, {
      triggerText: picked,
      expected: secondBox.text,
    });

    /* ── perf gate: jank must not scale with the account count ── */
    await loadHarness(FLOOR_N);
    const floorOpen = await openPicker({ measure: true });
    const floor = await measureDeletePhase();
    const jankAtN = Math.round(scenario.metrics.maxLongTask);
    const jankFloor = Math.round(floor.metrics.maxLongTask);
    const totalAtN = Math.round(scenario.metrics.totalLongTask);
    const totalFloor = Math.round(floor.metrics.totalLongTask);
    const allowed = Math.max(250, Math.round(jankFloor * 4));
    record(
      `perf: delete jank at ${N} accounts (${jankAtN}ms) stays near the ${FLOOR_N}-account floor (${jankFloor}ms)`,
      jankAtN <= allowed,
      { jankAtN, jankFloor, allowed, totalAtN, totalFloor },
    );

    /* Open cost is not gated in ms: the panel's own layout work dominates at every N. The
       structural check above ("a page, not every account") is the deterministic gate. */
    const openAtN = Math.round(openMetrics.maxFrameGap);
    const openFloor = Math.round(floorOpen.maxFrameGap);

    results.summary = {
      renderedOnOpen: opened.rendered,
      expectedOnOpen: opened.expected,
      openFrameGap: Math.round(openMetrics.maxFrameGap),
      openLongTask: Math.round(openMetrics.maxLongTask),
      narrowedRendered: scenario.narrowed.rendered,
      expandedRendered: scenario.expanded.rendered,
      expectedFull: scenario.expanded.expected,
      jankAtN,
      jankFloor,
      totalAtN,
      totalFloor,
      frameGapAtN: Math.round(scenario.metrics.maxFrameGap),
    };
    console.log(JSON.stringify(results, null, 2));
    const failed = results.checks.filter((c) => !c.pass);
    console.log(
      failed.length
        ? `\nRESULT: FAIL (${failed.length}/${results.checks.length})\n  - ${failed.map((f) => f.name).join("\n  - ")}`
        : `\nRESULT: PASS (${results.checks.length}/${results.checks.length})`,
    );
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("LOOP ERROR:", err.message);
  process.exitCode = 2;
});

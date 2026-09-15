/**
 * THROWAWAY CDP loop for the AccountSelect bug (delete with the fix).
 *
 *   node dev-harness/loop.mjs --n=5000 --throttle=10
 *
 * Drives the real `AccountSelect` component in a phone-sized headless Chromium:
 *   A) IME / word-mode typing  → composing text must survive and filter the list
 *   B) delete after filtering  → jank must not grow with the account count
 *   C) scroll / keyboard / click behaviour must survive the windowed rendering
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

const N = Number(argv.n || 5000);
const FLOOR_N = Number(argv.floorN || 30);
const THROTTLE = Number(argv.throttle || 10);
const BASE = String(argv.url || "http://localhost:5199/dev-harness/account-select.html");
/** Absolute sanity gate, generous because the harness floor itself costs ~200ms at 10x throttle. */
const FRAME_GAP_BUDGET_MS = Number(argv.budget || 120 + 30 * THROTTLE);
const CHROME =
  process.env.CHROME_PATH ||
  path.join(
    process.env.LOCALAPPDATA || "",
    "ms-playwright/chromium-1228/chrome-win64/chrome.exe",
  );

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

  const port = 9300 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(path.join(tmpdir(), "c168-harness-"));
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
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || "page eval failed");
      }
      return res.result.value;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

    const loadHarness = async (n) => {
      await send("Page.navigate", { url: `${BASE}?n=${n}` });
      await waitFor(() => evalInPage("!!(window.__harness && window.__harness.ready)"), {
        label: "harness ready",
      });
      await evalInPage("window.__harness.attachListObserver(); true");
    };

    const clickTrigger = async () => {
      const box = await evalInPage(
        `(() => { const el = document.querySelector('.custom-select-button'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
      );
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", {
          type,
          x: Math.round(box.x),
          y: Math.round(box.y),
          button: "left",
          clickCount: 1,
        });
      }
      return box;
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
    const arrowDown = async () => {
      await keyEvent("ArrowDown", "ArrowDown", 40);
      await sleep(120);
    };
    const setQuery = async (text) => {
      await evalInPage("window.__harness.setQuery(''); true");
      await send("Input.insertText", { text });
      await sleep(500);
    };

    /** Type an account number, then delete it back out — the reported "卡几秒" action. */
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

    const results = { n: N, throttle: THROTTLE, checks: [] };
    const record = (name, pass, detail) => results.checks.push({ name, pass, ...detail });

    /** Click the trigger and wait for the list; optionally measure the cost of opening it. */
    const openDropdown = async ({ measure = false } = {}) => {
      if (measure) await evalInPage("window.__harness.resetMetrics(); true");
      const triggerBox = await clickTrigger();
      await waitFor(() => evalInPage("window.__harness.isFocused()"), {
        label: "search input focused",
        timeout: 10000,
      });
      await waitFor(() => evalInPage("window.__harness.optionCount() > 0"), {
        label: "initial option list rendered",
        timeout: 30000,
      });
      await sleep(300);
      return {
        box: triggerBox,
        metrics: await evalInPage("window.__harness.metrics()"),
        snapshot: await evalInPage("window.__harness.snapshot()"),
      };
    };

    await loadHarness(N);
    const opened = await openDropdown({ measure: true });
    const box = opened.box;
    record(
      "open: mounting the list shows a page of accounts, not every account",
      opened.snapshot.rendered > 0 && opened.snapshot.rendered < opened.snapshot.expected,
      { renderedOnOpen: opened.snapshot.rendered, expectedOnOpen: opened.snapshot.expected },
    );

    /* ── A) real IME composition (Chinese / word-mode keyboard path) ── */
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
    record("ime: composing text is not rewritten in the DOM", composedLetter.value === "c", {
      value: composedLetter.value,
    });
    const transforms = await evalInPage("window.__harness.transforms()");
    record(
      "ime: search box still displays uppercase (CSS, not value rewriting)",
      transforms.input === "uppercase",
      { textTransform: transforms.input },
    );
    record(
      "css: shared rule uppercases every custom-select search box",
      transforms.probe === "uppercase",
      { textTransform: transforms.probe },
    );
    const composedWord = await compose("ca");
    record("ime: composing text survives the next keystroke", composedWord.value === "ca", {
      value: composedWord.value,
    });
    await send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });

    /* deterministic cross-check of the same sequence, independent of the CDP IME path */
    await evalInPage(
      "window.__harness.setQuery(''); window.__harness.simulateComposition('2135', { commit: true }); true",
    );
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
      { maxFrameGap: Math.round(scenario.metrics.maxFrameGap), maxLongTask: Math.round(scenario.metrics.maxLongTask) },
    );

    /* ── C) the window must keep growing so every account stays reachable ── */
    const beforeScroll = await evalInPage("window.__harness.snapshot()");
    await evalInPage("window.__harness.scrollOptionsToEnd(); true");
    await sleep(400);
    await evalInPage("window.__harness.scrollOptionsToEnd(); true");
    await sleep(400);
    const afterScroll = await evalInPage("window.__harness.snapshot()");
    record(
      "scroll: reaching the end of the list loads more rows",
      afterScroll.rendered > beforeScroll.rendered && afterScroll.prefixMatches,
      {
        renderedBefore: beforeScroll.rendered,
        renderedAfter: afterScroll.rendered,
        expected: afterScroll.expected,
      },
    );

    /* ── D) keyboard navigation selects the highlighted row ── */
    for (let i = 0; i < 3; i += 1) await arrowDown();
    const highlighted = await evalInPage("window.__harness.snapshot()");
    await keyEvent("Enter", "Enter", 13);
    await sleep(400);
    const afterEnter = await evalInPage("window.__harness.snapshot()");
    record(
      "keyboard: ArrowDown x3 + Enter selects the 4th match",
      afterEnter.buttonText === highlighted.expectedTexts[3] && !afterEnter.dropdownOpen,
      {
        buttonText: afterEnter.buttonText,
        expected: highlighted.expectedTexts[3],
        dropdownOpen: afterEnter.dropdownOpen,
      },
    );

    /* ── E) clicking a row selects it ── */
    await openDropdown();
    const optionBox = await evalInPage(
      `(() => { const el = document.querySelectorAll('.custom-select-option')[1]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.textContent }; })()`,
    );
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: Math.round(optionBox.x),
        y: Math.round(optionBox.y),
        button: "left",
        clickCount: 1,
      });
    }
    await sleep(400);
    const afterClick = await evalInPage("window.__harness.snapshot()");
    record("click: tapping a row selects it", afterClick.buttonText === optionBox.text, {
      buttonText: afterClick.buttonText,
      expected: optionBox.text,
    });

    /* ── F) arrowing past the rendered window ── */
    await openDropdown();
    await evalInPage("window.__harness.resetMetrics(); true");
    for (let i = 0; i < 45; i += 1) await arrowDown();
    const deepHighlight = await evalInPage("window.__harness.highlight()");
    const deepSnap = await evalInPage("window.__harness.snapshot()");
    const deepMetrics = await evalInPage("window.__harness.metrics()");
    record(
      "keyboard: arrowing past the window edge keeps the highlight on screen",
      !!deepHighlight && deepHighlight.idx >= 45 && deepHighlight.idx < deepSnap.rendered,
      { highlight: deepHighlight, rendered: deepSnap.rendered, expected: deepSnap.expected },
    );
    record(
      `keyboard: 45 arrow presses under ${Math.round(FRAME_GAP_BUDGET_MS)}ms/frame`,
      deepMetrics.maxFrameGap < FRAME_GAP_BUDGET_MS,
      { maxFrameGap: Math.round(deepMetrics.maxFrameGap), maxLongTask: Math.round(deepMetrics.maxLongTask) },
    );
    await keyEvent("Enter", "Enter", 13);
    await sleep(400);
    const afterDeepEnter = await evalInPage("window.__harness.snapshot()");
    record(
      "keyboard: Enter selects the row the user saw highlighted",
      afterDeepEnter.buttonText === deepHighlight?.text,
      { buttonText: afterDeepEnter.buttonText, expected: deepHighlight?.text },
    );

    /* ── G) wrap-around jump (ArrowUp on row 1 of a long list) must not freeze ── */
    await openDropdown();
    await evalInPage("window.__harness.resetMetrics(); true");
    await keyEvent("ArrowUp", "ArrowUp", 38);
    await sleep(600);
    const wrapHighlight = await evalInPage("window.__harness.highlight()");
    const wrapSnap = await evalInPage("window.__harness.snapshot()");
    const wrapMetrics = await evalInPage("window.__harness.metrics()");
    record(
      "keyboard: wrap-around keeps the highlight inside the rendered rows",
      !!wrapHighlight && wrapHighlight.idx < wrapSnap.rendered,
      { highlight: wrapHighlight, rendered: wrapSnap.rendered, expected: wrapSnap.expected },
    );
    record(
      `keyboard: wrap-around under ${Math.round(FRAME_GAP_BUDGET_MS)}ms/frame`,
      wrapMetrics.maxFrameGap < FRAME_GAP_BUDGET_MS,
      { maxFrameGap: Math.round(wrapMetrics.maxFrameGap), maxLongTask: Math.round(wrapMetrics.maxLongTask) },
    );

    /* ── H) the real regression gate: jank must not scale with the account count ── */
    await loadHarness(FLOOR_N);
    const floorOpened = await openDropdown({ measure: true });
    const floor = await measureDeletePhase();
    const jankAtN = Math.round(scenario.metrics.maxLongTask);
    const jankFloor = Math.round(floor.metrics.maxLongTask);
    const totalAtN = Math.round(scenario.metrics.totalLongTask);
    const totalFloor = Math.round(floor.metrics.totalLongTask);
    const allowed = Math.max(250, Math.round(jankFloor * 4));
    record(
      `perf: delete jank at ${N} accounts (${jankAtN}ms) stays near the ${FLOOR_N}-account floor (${jankFloor}ms)`,
      jankAtN <= allowed,
      { jankAtN, jankFloor, allowed, totalAtN, totalFloor, frameGapAtN: Math.round(scenario.metrics.maxFrameGap) },
    );

    /* Open cost is not gated in ms: the portal-positioning layout work dominates at every N
       (measured ~0.7-1.1s at 10x throttle even with 30 accounts). The structural check above
       ("a page, not every account") is the deterministic gate; the numbers are reported below. */
    const openAtN = Math.round(opened.metrics.maxFrameGap);
    const openFloor = Math.round(floorOpened.metrics.maxFrameGap);

    results.summary = {
      renderedOnOpen: opened.snapshot.rendered,
      expectedOnOpen: opened.snapshot.expected,
      openFrameGapAtN: openAtN,
      openFrameGapFloor: openFloor,
      narrowedRendered: scenario.narrowed.rendered,
      expandedRendered: scenario.expanded.rendered,
      expectedFull: scenario.expanded.expected,
      jankAtN,
      jankFloor,
      totalAtN,
      totalFloor,
      allowed,
      frameGapAtN: Math.round(scenario.metrics.maxFrameGap),
      frameGapFloor: Math.round(floor.metrics.maxFrameGap),
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

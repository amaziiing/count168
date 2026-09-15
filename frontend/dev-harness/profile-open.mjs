/** one-off profiler: where does the dropdown-open time go at N accounts? */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const N = Number((process.argv.find((a) => a.startsWith("--n=")) || "--n=5000").split("=")[1]);
const THROTTLE = Number((process.argv.find((a) => a.startsWith("--throttle=")) || "--throttle=10").split("=")[1]);
const URL_TO_OPEN = `http://localhost:5199/dev-harness/account-select.html?n=${N}`;
const CHROME = path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium-1228/chrome-win64/chrome.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9900 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(path.join(tmpdir(), "prof-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"],
  { stdio: "ignore" },
);

try {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await sleep(200);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener("open", res, { once: true }));
  let id = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  });
  const send = (method, params = {}) => {
    const i = id++;
    return new Promise((resolve) => {
      pending.set(i, { resolve });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  };
  const evalInPage = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
    return r.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Profiler.enable");
  await send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await send("Page.navigate", { url: URL_TO_OPEN });
  for (let i = 0; i < 200; i += 1) {
    if (await evalInPage("!!(window.__harness && window.__harness.ready)")) break;
    await sleep(200);
  }
  await sleep(1500);

  const box = await evalInPage(
    "(() => { const el = document.querySelector('.custom-select-button'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()",
  );
  await evalInPage("window.__harness.resetMetrics(); true");
  await send("Profiler.start");
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  for (let i = 0; i < 100; i += 1) {
    if (await evalInPage("window.__harness.optionCount() > 0")) break;
    await sleep(100);
  }
  await sleep(500);
  const { profile: prof } = await send("Profiler.stop");
  const metrics = await evalInPage("window.__harness.metrics()");
  console.log(`N=${N} throttle=${THROTTLE}  frameGap=${Math.round(metrics.maxFrameGap)}ms  longTask=${Math.round(metrics.maxLongTask)}ms`);

  /* self time per function */
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const selfTime = new Map();
  const total = prof.endTime - prof.startTime;
  for (let i = 0; i < prof.samples.length; i += 1) {
    const node = byId.get(prof.samples[i]);
    if (!node) continue;
    const dt = prof.timeDeltas[i] || 0;
    const key = `${node.callFrame.functionName || "(anonymous)"}  ${(node.callFrame.url || "").replace(/^https?:\/\/[^/]+/, "").slice(-48)}:${node.callFrame.lineNumber + 1}`;
    selfTime.set(key, (selfTime.get(key) || 0) + dt);
  }
  const rows = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  console.log(`profile window: ${(total / 1000).toFixed(0)}ms`);
  for (const [key, us] of rows) console.log(`  ${(us / 1000).toFixed(1).padStart(8)}ms  ${key}`);
  ws.close();
} finally {
  chrome.kill();
  spawn("taskkill", ["/F", "/T", "/PID", String(chrome.pid)], { stdio: "ignore" });
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

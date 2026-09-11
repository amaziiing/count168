/**
 * Repro smoke: Won Casino allGames report paste (1 agent + Total(1))
 * into Data Capture 1.TEXT / 2.FORMAT parsers.
 *
 * Source: https://ag.75004594.xyz/#/e/report/allGames (iview split tables).
 *
 * Usage:
 *   node scripts/playwright-allgames-paste-smoke.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parsePlainTextMatrix } from "../src/pages/datacapture/paste/core/dataCaptureTextPaste.js";
import {
  looksLikeAllGamesPlain,
  tryReshapeAllGamesPlainMatrix,
} from "../src/pages/datacapture/paste/core/dataCaptureAllGamesPasteHelper.js";
import { detectVerticalFieldDump } from "../src/pages/datacapture/paste/core/dataCaptureVerticalDumpDetect.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

function loadPlaywright() {
  const candidates = [
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — run npm i -D playwright in frontend/");
}

/** Real selection.toString() from allGames (empty cols stripped). */
const PLAIN = `\t
WN002
WoQ13MED
m10915
agent
MYR
563
1,455,900.00
-95,975.00
1,346,400.00
-7.12%
0.80%
969.40
91.00%
87,337.25
7,668.34
88,306.65
88,306.65
0.00
Total(1)
563
1,455,900.00
-95,975.00
1,346,400.00
969.40
87,337.25
7,668.34
88,306.65
88,306.65
0.00
`;

const EXPECT_AGENT = [
  "WN002",
  "WoQ13MED",
  "m10915",
  "agent",
  "MYR",
  "563",
  "1,455,900.00",
  "-95,975.00",
  "1,346,400.00",
  "-7.12%",
  "0.80%",
  "969.40",
  "91.00%",
  "87,337.25",
  "7,668.34",
  "88,306.65",
  "88,306.65",
  "0.00",
];

const EXPECT_TOTAL = [
  "Total(1)",
  "",
  "",
  "",
  "",
  "563",
  "1,455,900.00",
  "-95,975.00",
  "1,346,400.00",
  "",
  "",
  "969.40",
  "",
  "87,337.25",
  "7,668.34",
  "88,306.65",
  "88,306.65",
  "0.00",
];

const HTML_TWO_TABLES = `<div class="ivu-table-body"><table><tbody class="ivu-table-tbody"><tr>
<td></td><td></td><td>WN002</td><td>WoQ13MED</td><td>m10915</td><td>agent</td><td>MYR</td>
<td>563</td><td>1,455,900.00</td><td>-95,975.00</td><td>1,346,400.00</td>
<td>-7.12%</td><td>0.80%</td><td>969.40</td><td>91.00%</td>
<td>87,337.25</td><td>7,668.34</td><td>88,306.65</td><td>88,306.65</td><td>0.00</td>
</tr></tbody></table></div>
<div><table class="ivu-table-summary"><tbody class="ivu-table-tbody"><tr>
<td></td><td></td><td>Total(1)</td><td></td><td></td><td></td><td></td>
<td>563</td><td>1,455,900.00</td><td>-95,975.00</td><td>1,346,400.00</td>
<td></td><td></td><td>969.40</td><td></td>
<td>87,337.25</td><td>7,668.34</td><td>88,306.65</td><td>88,306.65</td><td>0.00</td>
</tr></tbody></table></div>`;

let failed = 0;
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`  ✗ ${msg}`);
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

function assertRow(actual, expected, label) {
  assert(
    Array.isArray(actual) && actual.length === expected.length,
    `${label} length ${actual?.length} === ${expected.length}`,
  );
  for (let i = 0; i < expected.length; i += 1) {
    const a = String(actual?.[i] ?? "");
    const e = String(expected[i] ?? "");
    if (a !== e) {
      fail(`${label}[${i}] got "${a}" want "${e}"`);
      return;
    }
  }
  ok(`${label} cells match`);
}

console.log("allGames paste smoke\n[1] Plain reshape");

assert(looksLikeAllGamesPlain(PLAIN), "looksLikeAllGamesPlain");
assert(
  detectVerticalFieldDump(PLAIN.split("\n").filter((l) => l.trim())) == null,
  "shared vertical-dump still null (scoped helper owns this)",
);

const reshaped = tryReshapeAllGamesPlainMatrix(PLAIN);
assert(reshaped?.length === 2, `reshape rows === 2 (got ${reshaped?.length})`);
assertRow(reshaped?.[0], EXPECT_AGENT, "reshape agent");
assertRow(reshaped?.[1], EXPECT_TOTAL, "reshape Total(1)");

const parsed = parsePlainTextMatrix(PLAIN);
assert(parsed?.length === 2, `parsePlainTextMatrix rows === 2 (got ${parsed?.length})`);
assert((parsed?.[0]?.length || 0) >= 14, `parsePlain cols >= 14 (got ${parsed?.[0]?.length})`);
assert(String(parsed?.[0]?.[0] || "") === "WN002", "parsePlain [0][0] WN002");
assert(String(parsed?.[1]?.[0] || "").toLowerCase().startsWith("total"), "parsePlain [1][0] Total");
assert(tryReshapeAllGamesPlainMatrix("CK203\n87\nAGENT\n1.00\n2.00") == null, "reject non-allGames plain");

console.log("\n[2] Playwright DOM: merge ivu body + summary");

const { chromium } = loadPlaywright();
const coreDir = path.join(frontendRoot, "src/pages/datacapture/paste/core");

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!DOCTYPE html><html><body></body></html>");
      return;
    }
    if (req.url?.startsWith("/paste-mod/")) {
      const base = path.basename(decodeURIComponent(req.url.slice("/paste-mod/".length)));
      let body = await fs.readFile(path.join(coreDir, base), "utf8");
      body = body.replace(
        /from\s+["'](\.\/[^"']+)["']/g,
        (_m, spec) => `from "/paste-mod/${path.basename(spec)}"`,
      );
      body = body.replace(/from\s+["']((?:\.\.\/)+[^"']+)["']/g, (_m, spec) => {
        const resolved = path.resolve(coreDir, spec);
        const rel = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
        return `from "/src/${rel}"`;
      });
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(body);
      return;
    }
    if (req.url?.startsWith("/src/")) {
      const rel = decodeURIComponent(req.url.slice("/src/".length));
      const filePath = path.join(frontendRoot, rel);
      let body = await fs.readFile(filePath, "utf8");
      const dir = path.dirname(filePath);
      body = body.replace(/from\s+["'](\.[^"']+)["']/g, (_m, spec) => {
        const resolved = path.resolve(dir, spec);
        const out = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
        return `from "/src/${out}"`;
      });
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(origin);

  const htmlResult = await page.evaluate(async (html) => {
    const helper = await import("/paste-mod/dataCaptureAllGamesPasteHelper.js");
    const normalizeMod = await import("/paste-mod/dataCaptureFormatClipboardNormalize.js");
    const root = document.createElement("div");
    root.innerHTML = html;
    const merged = helper.tryMergeAllGamesIvuTables(root);
    const mergedRows = merged
      ? Array.from(merged.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.querySelectorAll("td,th")).map((td) => (td.innerText || "").trim()),
        )
      : null;
    const normalized = normalizeMod.normalizeClipboardHtmlToTable(html);
    const normRoot = document.createElement("div");
    normRoot.innerHTML = normalized || "";
    return {
      mergedRows,
      normTables: normRoot.querySelectorAll("table").length,
      normRows: Array.from(normRoot.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td,th")).map((td) => (td.innerText || "").trim()),
      ),
    };
  }, HTML_TWO_TABLES);

  assert(htmlResult.mergedRows?.length === 2, `HTML merge rows === 2 (got ${htmlResult.mergedRows?.length})`);
  assert(htmlResult.mergedRows?.[0]?.[2] === "WN002", "HTML merge agent Operator col");
  assert(/^Total\(1\)$/i.test(htmlResult.mergedRows?.[1]?.[2] || ""), "HTML merge Total Operator col");
  assert(htmlResult.normTables === 1, `normalize → 1 table (got ${htmlResult.normTables})`);
  assert(htmlResult.normRows?.length === 2, `normalize rows === 2 (got ${htmlResult.normRows?.length})`);
  assert(/^Total\(1\)$/i.test(htmlResult.normRows?.[1]?.[2] || ""), "normalize keeps Total(1)");
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\nFAILED: ${failed} assertion(s)`);
  process.exit(1);
}
console.log("\nSMOKE GREEN — allGames plain + HTML merge");

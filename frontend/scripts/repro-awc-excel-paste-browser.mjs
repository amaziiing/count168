/**
 * Real-browser check: paste the AWC API report the way Excel puts it on the
 * clipboard (text/html = one rectangular <table> + text/plain = TSV) and run
 * buildAwcWinLossReportMatrix against a live DOM.
 *
 * The datacapture paste modules use relative imports except `decimal.js`, so
 * this harness serves a tiny page with an import map pointing at the ESM build
 * in node_modules, imports the real source module, and builds the matrix in
 * the page.
 *
 * Prereq: `python -m http.server 8899` at the repo root.
 * Run:    node scripts/repro-awc-excel-paste-browser.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(here, "..");
const serverRoot = path.join(frontendDir, "..");
const tsv = readFileSync(path.join(here, "fixtures/awc-report.tsv"), "utf8").replace(/\r\n/g, "\n");
const rows = tsv.split("\n").filter((l) => l.length).map((l) => l.split("\t"));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tds = (cells) => cells.map((c) => `<td height=20 style='height:15.0pt'>${esc(c)}</td>`).join("");
// Fidelity: the shape Excel actually emits — xmlns headers, one collapsed
// <table>, <col span>, styled <tr>/<td>, empty trailing cells included.
// AWC_FLAVOR=sheets switches to Google Sheets' shape: source meta tags,
// <tbody>, per-cell inline styles — still one rectangular <table>.
const sheetsFlavor = process.env.AWC_FLAVOR === "sheets";
const excelHtml = sheetsFlavor
  ? `<meta charset='utf-8'><meta name="source" content="sheets-paste"><style type="text/css" name="CopyRange">td {white-space:normal;vertical-align:bottom;}</style>
<table style="white-space:normal;word-wrap:break-word; table-layout:fixed"><colgroup><col style="width:100px" span=${rows[0].length}></colgroup>
<tbody>${rows.map((r) => `<tr style="height:21px;">${r.map((c) => `<td style="background-color:#ffffff;padding:2px 4px;font-weight:400;">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
  : `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"></head>
<body><!--StartFragment--><table border=0 cellpadding=0 cellspacing=0 width=2000 style='border-collapse:collapse;table-layout:fixed;width:1500pt'>
<col width=80 span=${rows[0].length}>
${rows.map((r) => `<tr height=20 style='height:15.0pt'>${tds(r)}</tr>`).join("\n")}
</table><!--EndFragment--></body></html>`;

const BASE = process.env.AWC_HARNESS_URL || "http://127.0.0.1:8899";
const MODULE_PATH = "/frontend/src/pages/datacapture/paste/vendors/dataCaptureAwcPaste.js";
const HARNESS_FS_PATH = path.join(serverRoot, "frontend/src/__awc_harness.html");
const DECIMAL_FS_PATH = path.join(serverRoot, "frontend/src/__decimal_harness.js");
const HARNESS_URL = `${BASE}/frontend/src/__awc_harness.html`;

// python -m http.server serves .mjs as text/plain on Windows (registry MIME);
// module scripts need a JS MIME, so serve the ESM build from a .js path.
copyFileSync(path.join(frontendDir, "node_modules/decimal.js/decimal.mjs"), DECIMAL_FS_PATH);

writeFileSync(
  HARNESS_FS_PATH,
  `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"decimal.js":"/frontend/src/__decimal_harness.js"}}</script>
</head><body><script type="module">
window.__awcReady = false;
try {
  window.__awc = await import("${MODULE_PATH}");
} catch (err) {
  window.__awcError = String(err && err.message || err);
}
window.__awcReady = true;
</script></body></html>`,
);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => console.log("[console]", m.type(), m.text()));

try {
  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__awcReady === true, null, { timeout: 30000 });

  const result = await page.evaluate(({ html, text }) => {
    if (window.__awcError) return { importError: window.__awcError };
    const mod = window.__awc;
    const matrix = mod.buildAwcWinLossReportMatrix(html, text);
    return {
      rows: matrix?.length ?? 0,
      cols: matrix?.[0]?.length ?? 0,
      firstRowHead: matrix?.[0]?.slice(0, 4) ?? [],
      userNames: matrix?.map((r) => r[2]),
      looksLikePlainLines: mod.looksLikeAwcWinLossReportTokens(
        text.split("\n").map((l) => l.trim()).filter(Boolean),
      ),
    };
  }, { html: excelHtml, text: tsv });

  console.log("plain TSV lines gate (expect false):", result.looksLikePlainLines);
  console.log(`matrix: ${result.rows} rows x ${result.cols} cols`);
  console.log("row 0 head:", (result.firstRowHead || []).join(" | "));
  console.log("User Name column:", (result.userNames || []).join(", "));

  const fail = [];
  if (result.importError) fail.push(`module import failed: ${result.importError}`);
  if (result.rows !== rows.length) fail.push(`expected ${rows.length} rows, got ${result.rows}`);
  if (result.cols !== rows[0].length) fail.push(`expected ${rows[0].length} cols, got ${result.cols}`);
  if (result.userNames?.[0] !== "User Name") fail.push("header row missing");
  for (const id of ["717a", "KZ999"]) {
    if (!result.userNames?.includes(id)) fail.push(`rows for ${id} missing`);
  }
  if (fail.length) {
    console.error("FAIL:\n- " + fail.join("\n- "));
    process.exitCode = 1;
  } else {
    console.log("PASS: full grid survives the Excel clipboard paste in a real DOM");
  }
} finally {
  await browser.close();
  try { unlinkSync(HARNESS_FS_PATH); } catch {}
  try { unlinkSync(DECIMAL_FS_PATH); } catch {}
}

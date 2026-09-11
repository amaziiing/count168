/**
 * User screenshot fixture: SDSPDA95 / 6,522 / $11,110.75…
 * Run: node ./scripts/repro-user-screenshot-paste.mjs
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.DOMParser = window.DOMParser;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

const userHtml = `
<table>
  <tr><td>
    <div class="mat-cell cdk-column-agent_account">SDSPDA95</div>
    <div class="mat-cell cdk-column-bet_count">6,522</div>
    <div class="mat-cell cdk-column-event_amount">$0.00</div>
    <div class="mat-cell cdk-column-bet_amount">$11,110.75</div>
    <div class="mat-cell cdk-column-real_bet_amount">$11,110.75</div>
    <div class="mat-cell cdk-column-payout_amount">$9,825.31</div>
    <div class="mat-cell cdk-column-valid_amount">$11,110.75</div>
    <div class="mat-cell cdk-column-fee_amount">$0.00</div>
    <div class="mat-cell positive">$1,285.44</div>
  </td></tr>
  <tr><td>
    <div class="mat-cell">Subtotal</div>
    <div class="mat-cell">6,522</div>
    <div class="mat-cell">$0.00</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$9,825.31</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$0.00</div>
    <div class="mat-cell">$1,285.44</div>
  </td></tr>
  <tr><td>
    <div class="mat-cell">Total Amount</div>
    <div class="mat-cell">6,522</div>
    <div class="mat-cell">$0.00</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$9,825.31</div>
    <div class="mat-cell">$11,110.75</div>
    <div class="mat-cell">$0.00</div>
    <div class="mat-cell">$1,285.44</div>
  </td></tr>
</table>`;

const plainNewline = `SDSPDA95
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

const matRowHtml = `
<div class="mat-table">
  <div class="mat-row" role="row" style="display:flex">
    <div class="mat-cell" role="gridcell">SDSPDA95</div>
    <div class="mat-cell" role="gridcell">6,522</div>
    <div class="mat-cell" role="gridcell">$0.00</div>
    <div class="mat-cell" role="gridcell">$11,110.75</div>
    <div class="mat-cell" role="gridcell">$11,110.75</div>
    <div class="mat-cell" role="gridcell">$9,825.31</div>
    <div class="mat-cell" role="gridcell">$11,110.75</div>
    <div class="mat-cell" role="gridcell">$0.00</div>
    <div class="mat-cell" role="gridcell">$1,285.44</div>
  </div>
</div>`;

function matrixFromHtml(html) {
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  const structure = parseFormatHtmlTableStructure(normalized);
  if (!structure) return { ok: false, reason: "no-structure", cols: 0, rows: 0 };
  const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
  const cols = body[0]?.length || 0;
  const rows = body.length;
  return {
    ok: cols >= 8 && rows >= 1,
    rows,
    cols,
    sample: body.map((r) => r.map((c) => String(c.value || "").trim())),
  };
}

let failed = 0;

const htmlResult = matrixFromHtml(userHtml);
console.log(
  `${htmlResult.ok ? "PASS" : "FAIL"} user-html-1td-nested-mat: ${htmlResult.rows}x${htmlResult.cols}`,
);
if (!htmlResult.ok) failed += 1;
else console.log("  row0:", htmlResult.sample[0]);

const matResult = matrixFromHtml(matRowHtml);
console.log(
  `${matResult.ok ? "PASS" : "FAIL"} user-mat-row-divs: ${matResult.rows}x${matResult.cols}`,
);
if (!matResult.ok) failed += 1;
else console.log("  row0:", matResult.sample[0]);

// Report site exact copy shapes (mat-row + mat-footer-row plain text)
const report1Row = plainNewline;
const report2Rows = `${plainNewline}
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;
const report3Rows = `${report2Rows}
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;
const report4Rows = `${plainNewline}
SDSPDA95B
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

for (const [name, plain, expectRows, expectCols] of [
  ["report-copy-1-row", report1Row, 1, 9],
  ["report-copy-2-rows", report2Rows, 2, 9],
  ["report-copy-3-rows", report3Rows, 3, 9],
  ["report-copy-4-rows", report4Rows, 4, 9],
]) {
  const m = parsePlainTextMatrix(plain);
  const ok = m.length === expectRows && (m[0]?.length || 0) === expectCols;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${m.length}x${m[0]?.length || 0}`);
  if (!ok) {
    failed += 1;
    console.log("  matrix:", m);
  }
}

const plainResult = parsePlainTextMatrix(plainNewline);
const plainCols = plainResult[0]?.length || 0;
const plainRows = plainResult.length;
const plainOk = plainCols >= 8 && plainRows === 1;
console.log(
  `${plainOk ? "PASS" : "FAIL"} user-plain-newline-only: ${plainRows}x${plainCols}`,
);
console.log("  matrix:", plainResult);
if (!plainOk) {
  failed += 1;
  console.log(
    "  NOTE: this is the screenshot failure mode — vertical dump into column 1",
  );
}

// Guard: intentional all-numeric column must stay vertical (no false reshape).
const numericColumn = ["100", "200", "300", "$4.00", "5,000", "6.5", "7", "8", "9"];
const numericMatrix = parsePlainTextMatrix(numericColumn.join("\n"));
const numericOk =
  numericMatrix.length === numericColumn.length &&
  numericMatrix.every((row) => row.length === 1);
console.log(
  `${numericOk ? "PASS" : "FAIL"} all-numeric-column-stays-1col: ${numericMatrix.length}x${numericMatrix[0]?.length || 0}`,
);
if (!numericOk) failed += 1;

// Guard: multi-row vertical dump with repeating leading labels (no hard-coded width).
const multiPlain = `AGENTA
10
$1.00
$2.00
$3.00
AGENTB
20
$4.00
$5.00
$6.00`;
const multiMatrix = parsePlainTextMatrix(multiPlain);
const multiOk =
  multiMatrix.length === 2 &&
  multiMatrix[0]?.length === 5 &&
  multiMatrix[1]?.[0] === "AGENTB";
console.log(
  `${multiOk ? "PASS" : "FAIL"} multi-row-label-stride: ${multiMatrix.length}x${multiMatrix[0]?.length || 0}`,
);
if (!multiOk) {
  failed += 1;
  console.log("  matrix:", multiMatrix);
}

// Mario Club WIN LOSE PT (DataTables): headers + data + Total + Grand Total
const marioHeaders = [
  "Downline Login Id",
  "Total Turnover",
  "Total Win Lose",
  "Total Member Bonus",
  "Total Agent Bonus",
  "Downline Member Bonus",
  "Member Bonus",
  "Upline Member Bonus",
  "Downline Agent Bonus",
  "Agent Bonus",
  "Upline Agent Bonus",
  "Downline Win Lose",
  "Win Lose",
  "Upline Win Lose",
  "Downline Total",
  "Total",
  "Upline Total",
];
const marioData = [
  "MCKAP02",
  "125.99",
  "-12.12",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "10.61",
  "0.06",
  "1.45",
  "10.61",
  "0.06",
  "1.45",
];
const marioTotal = ["Total:", ...marioData.slice(1)];
const marioGrand = ["Grand Total", "125.99", "-12.12", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "10.60", "0.06", "1.45", "10.60", "0.06", "1.45"];

const marioWithHeaders = [...marioHeaders, ...marioHeaders, ...marioTotal, ...marioData, ...marioTotal, ...marioGrand].join(
  "\n",
);
const marioMatrix = parsePlainTextMatrix(marioWithHeaders);
const marioOk =
  marioMatrix.length === 4 &&
  marioMatrix[0]?.length === 17 &&
  marioMatrix[0]?.[0] === "Total:" &&
  marioMatrix[1]?.[0] === "MCKAP02" &&
  marioMatrix[1]?.[2] === "-12.12" &&
  marioMatrix[2]?.[0] === "Total:" &&
  marioMatrix[3]?.[0] === "Grand Total";
console.log(
  `${marioOk ? "PASS" : "FAIL"} mario-datatables-headers-total-grand: ${marioMatrix.length}x${marioMatrix[0]?.length || 0}`,
);
if (!marioOk) {
  failed += 1;
  console.log(
    "  labels:",
    marioMatrix.map((r) => r[0]),
    "row1col2:",
    marioMatrix[1]?.[2],
  );
}

const marioDataOnly = parsePlainTextMatrix(marioData.join("\n"));
const marioDataOk =
  marioDataOnly.length === 1 &&
  marioDataOnly[0]?.length === 17 &&
  marioDataOnly[0]?.[2] === "-12.12";
console.log(
  `${marioDataOk ? "PASS" : "FAIL"} mario-data-row-only: ${marioDataOnly.length}x${marioDataOnly[0]?.length || 0}`,
);
if (!marioDataOk) failed += 1;

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log("\nAll user-screenshot cases green");

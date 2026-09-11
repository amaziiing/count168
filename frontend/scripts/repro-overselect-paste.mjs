/**
 * Over-select ("drag to end") plain-text paste fixtures.
 * Expect: keep complete dense rows; drop truncated trailing tokens / paginator.
 * Run: node ./scripts/repro-overselect-paste.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { sanitizePasteMatrix } = await import(
  pathToFileURL(path.join(base, "dataCapturePasteMatrixSanitize.js")).href,
);

function assertMatrix(name, plain, expectRows, expectCols, opts = {}) {
  const matrix = parsePlainTextMatrix(plain);
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const isNx1 = rows > 1 && cols === 1;
  const okRows = rows === expectRows;
  const okCols = cols === expectCols;
  const okNoVertical = opts.allowVertical || !isNx1;
  const okFirstNum = opts.firstNumCol == null || matrix[0]?.[opts.firstNumCol] === opts.firstNumValue;
  const ok = okRows && okCols && okNoVertical && okFirstNum;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: got ${rows}x${cols}` +
      (isNx1 ? " (vertical dump)" : "") +
      ` expected ${expectRows}x${expectCols}`,
  );
  if (!ok) {
    console.log(
      "  matrix:",
      matrix.map((r) => r.map((c) => String(c).slice(0, 16))),
    );
  }
  return ok ? 0 : 1;
}

let failed = 0;

// Partial next agent row after 2 complete 5-col rows → drop stub, keep 2x5
failed += assertMatrix(
  "partial-next-row",
  [
    "AGENTA",
    "10",
    "$1.00",
    "$2.00",
    "$3.00",
    "AGENTB",
    "20",
    "$4.00",
    "$5.00",
    "$6.00",
    "AGENTC",
    "30",
    "$7.00",
  ].join("\n"),
  2,
  5,
);

// Multi-line DataTables paginator after one complete 9-col row
failed += assertMatrix(
  "multiline-paginator",
  [
    "SDSPDA95",
    "6522",
    "$0.00",
    "$1.00",
    "$2.00",
    "$3.00",
    "$4.00",
    "$0.00",
    "$5.00",
    "Showing",
    "1",
    "to",
    "10",
    "of",
    "50",
    "entries",
  ].join("\n"),
  1,
  9,
);

// Complete agent + Subtotal + truncated Total Amount → keep 2x9
failed += assertMatrix(
  "truncated-total-amount",
  [
    "SDSPDA95",
    "6522",
    "$0.00",
    "$11,110.75",
    "$11,110.75",
    "$9,825.31",
    "$11,110.75",
    "$0.00",
    "$1,285.44",
    "Subtotal",
    "6522",
    "$0.00",
    "$11,110.75",
    "$11,110.75",
    "$9,825.31",
    "$11,110.75",
    "$0.00",
    "$1,285.44",
    "Total Amount",
    "6522",
    "$0.00",
  ].join("\n"),
  2,
  9,
);

// Label-only trailing chrome (already expected green)
failed += assertMatrix(
  "label-only-trailing",
  [
    "AGENTA",
    "10",
    "$1.00",
    "$2.00",
    "$3.00",
    "Downline Login Id",
    "Total Turnover",
  ].join("\n"),
  1,
  5,
);

// Guard: intentional all-numeric vertical list stays Nx1
failed += assertMatrix(
  "numeric-column-guard",
  ["100", "200", "300", "$4.00", "5,000"].join("\n"),
  5,
  1,
  { allowVertical: true },
);

// Total row: preserve blank tabs between label and first number (web 1:1)
failed += assertMatrix(
  "total-row-label-gap",
  "Total\t\t135,873.00\t114,191.00\t11\t950",
  1,
  6,
  { firstNumCol: 2, firstNumValue: "135,873.00" },
);

// Screenshot: Total | empty | empty | 135,873.00 | … (two name-column gaps)
failed += assertMatrix(
  "total-row-double-empty-gap",
  "Total\t\t\t135,873.00\t114,191.00\t11\t950",
  1,
  7,
  { firstNumCol: 3, firstNumValue: "135,873.00" },
);

// Total row: drag-to-end trailing empty tab cells
failed += assertMatrix(
  "total-row-trailing-empty-tabs",
  "Total\t135,873.00\t114,191.00\t11\t\t\t",
  1,
  4,
);

// Sub Total keeps intentional name-column gap (2.Format style)
const subTotalMatrix = parsePlainTextMatrix("Sub Total\t\t135,873.00\t114,191.00");
const subCols = subTotalMatrix[0]?.length || 0;
const subGapKept =
  subTotalMatrix.length === 1 &&
  subCols === 4 &&
  subTotalMatrix[0][0] === "Sub Total" &&
  subTotalMatrix[0][1] === "" &&
  subTotalMatrix[0][2] === "135,873.00";
console.log(
  `${subGapKept ? "PASS" : "FAIL"} sub-total-gap-preserved: got ${subTotalMatrix.length}x${subCols}`,
);
if (!subGapKept) {
  failed += 1;
  console.log("  matrix:", subTotalMatrix);
}

// Format-style cell matrix: Total label gap + trailing empty cols (text+format path)
const formatTotalRow = sanitizePasteMatrix([
  [
    { value: "Total", styleCssText: "background:#ff0" },
    { value: "" },
    { value: "135,873.00" },
    { value: "114,191.00" },
    { value: "" },
    { value: "" },
  ],
]);
const formatOk =
  formatTotalRow.length === 1 &&
  formatTotalRow[0].length === 4 &&
  formatTotalRow[0][0].value === "Total" &&
  formatTotalRow[0][1].value === "" &&
  formatTotalRow[0][2].value === "135,873.00" &&
  formatTotalRow[0][3].value === "114,191.00";
console.log(
  `${formatOk ? "PASS" : "FAIL"} format-total-row-sanitize: cols=${formatTotalRow[0]?.length}`,
);
if (!formatOk) {
  failed += 1;
  console.log(
    "  row:",
    formatTotalRow[0]?.map((c) => c.value),
  );
}

// 2.Format over-select: Total row + paginator row + trailing empty cols
const formatOverselect = sanitizePasteMatrix([
  [
    { value: "Total" },
    { value: "" },
    { value: "135,873.00" },
    { value: "114,191.00" },
    { value: "" },
    { value: "" },
  ],
  [{ value: "Showing" }, { value: "1" }, { value: "to" }, { value: "10" }],
]);
const formatOverOk =
  formatOverselect.length === 1 &&
  formatOverselect[0][1]?.value === "" &&
  formatOverselect[0][2]?.value === "135,873.00";
console.log(
  `${formatOverOk ? "PASS" : "FAIL"} format-overselect-paginator: rows=${formatOverselect.length}`,
);
if (!formatOverOk) {
  failed += 1;
  console.log(
    "  matrix:",
    formatOverselect.map((r) => r.map((c) => c.value)),
  );
}

const { plainMatrixLooksReliable, matrixAlignsWithPlainSource } = await import(
  pathToFileURL(path.join(base, "dataCapturePasteMatrixSanitize.js")).href,
);

const plainTruth = parsePlainTextMatrix("Total\t\t135,873.00\t114,191.00");
const htmlMisaligned = [
  [{ value: "Total" }, { value: "135,873.00" }, { value: "114,191.00" }],
];
const htmlAligned = [
  [{ value: "Total" }, { value: "" }, { value: "135,873.00" }, { value: "114,191.00" }],
];
const alignReject =
  plainMatrixLooksReliable(plainTruth) &&
  !matrixAlignsWithPlainSource(htmlMisaligned, plainTruth);
const alignAccept = matrixAlignsWithPlainSource(
  sanitizePasteMatrix(htmlAligned),
  plainTruth,
);
console.log(
  `${alignReject && alignAccept ? "PASS" : "FAIL"} plain-html-cross-check`,
);
if (!(alignReject && alignAccept)) {
  failed += 1;
  console.log("  rejectMisaligned=", alignReject, "acceptSanitized=", alignAccept);
}

// Statement footer: SUBTOTAL/GRANDTOTAL have fewer filled cols than body — must keep.
const bodyAmt = Array.from({ length: 13 }, (_, i) => String(100 + i));
const statementRows = [
  ["1", "OB", "RS", ...bodyAmt],
  ["2", "OC", "NIXON", ...bodyAmt.map((n) => String(Number(n) + 1))],
  ["3", "OD", "KX", ...bodyAmt.map((n) => String(Number(n) + 2))],
  // Summary rows skip serial/code columns → fewer non-empty cells
  ["SUBTOTAL", "", "", ...bodyAmt.map((n) => `${n}.00`)],
  ["GRAND TOTAL", "", "", ...bodyAmt.map((n) => `${Number(n) * 2}.00`)],
];
const statementKept = sanitizePasteMatrix(statementRows);
const statementOk =
  statementKept.length === 5 &&
  statementKept[3][0] === "SUBTOTAL" &&
  statementKept[4][0] === "GRAND TOTAL";
console.log(
  `${statementOk ? "PASS" : "FAIL"} statement-summary-footers-kept: rows=${statementKept.length}`,
);
if (!statementOk) {
  failed += 1;
  console.log(
    "  last rows:",
    statementKept.slice(-2).map((r) => r.slice(0, 4)),
  );
}

// Truncated HTML missing footers must not align with full plain → Format dual-source.
const plainFull = statementKept;
const htmlMissingFooters = sanitizePasteMatrix(statementRows.slice(0, 3));
const rejectMissingFooters =
  plainMatrixLooksReliable(plainFull) &&
  !matrixAlignsWithPlainSource(htmlMissingFooters, plainFull) &&
  matrixAlignsWithPlainSource(plainFull, plainFull);
console.log(
  `${rejectMissingFooters ? "PASS" : "FAIL"} format-reject-missing-summary-rows`,
);
if (!rejectMissingFooters) {
  failed += 1;
}

const { parseHTML } = await import("linkedom");
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  DOMParser: window.DOMParser,
});

const { buildFormatBodyMatrix, parseFormatHtmlTableStructure } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

// User symptom: over-select HTML can yield Total row + phantom lone TOTAL row, while
// plain TSV (1.TEXT) stays one full row with double empty gap + all numbers.
const totalNums = [
  "135,873.00",
  "114,191.00",
  "11",
  "950",
  "479.93",
  "-30,681.48",
  "59.93",
  "-30,621.55",
  "0.00",
  "0.00",
  "353.45",
  "353.45",
  "105,626.68",
  "28,380.36",
  "-377.39",
  "28,002.97",
  "8,564.33",
  "2,301.11",
  "-35.99",
  "2,265.12",
];
const plainTotalTsv = ["Total", "", "", ...totalNums, "", "", ""].join("\t");
const plainTruthFull = parsePlainTextMatrix(plainTotalTsv);

const overselectHtml = `<table><tbody>
<tr>
  <td>Total</td><td></td><td></td>
  ${totalNums.map((n) => `<td>${n}</td>`).join("")}
  <td></td><td></td><td></td>
</tr>
<tr><td colspan="3">TOTAL</td>${Array(totalNums.length + 3)
  .fill("<td></td>")
  .join("")}</tr>
</tbody></table>`;

const structure = parseFormatHtmlTableStructure(overselectHtml);
let formatBody = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const beforeSanitizeRows = formatBody.length;
formatBody = sanitizePasteMatrix(formatBody);

const sanitizeDroppedPhantom =
  beforeSanitizeRows >= 2 &&
  formatBody.length === 1 &&
  formatBody[0][0]?.value === "Total" &&
  formatBody[0][3]?.value === "135,873.00" &&
  formatBody[0][formatBody[0].length - 1]?.value === "2,265.12";
console.log(
  `${sanitizeDroppedPhantom ? "PASS" : "FAIL"} format-html-overselect-sanitize: rows ${beforeSanitizeRows}→${formatBody.length} cols=${formatBody[0]?.length}`,
);
if (!sanitizeDroppedPhantom) {
  failed += 1;
  console.log(
    "  row0:",
    formatBody[0]?.map((c) => c.value),
  );
}

// Truncated HTML (missing last 2 numbers) must not align with full plain → dual-source.
const truncatedHtmlBody = sanitizePasteMatrix([
  [
    { value: "Total" },
    { value: "" },
    { value: "" },
    ...totalNums.slice(0, -2).map((value) => ({ value })),
  ],
  [{ value: "TOTAL" }],
]);
const rejectTruncated =
  plainMatrixLooksReliable(plainTruthFull) &&
  !matrixAlignsWithPlainSource(truncatedHtmlBody, plainTruthFull) &&
  matrixAlignsWithPlainSource(formatBody, plainTruthFull);
console.log(
  `${rejectTruncated ? "PASS" : "FAIL"} format-html-overselect-plain-cross-check`,
);
if (!rejectTruncated) {
  failed += 1;
  console.log(
    "  plainCols=",
    plainTruthFull[0]?.length,
    "sanitizedCols=",
    formatBody[0]?.length,
    "truncatedAligned=",
    matrixAlignsWithPlainSource(truncatedHtmlBody, plainTruthFull),
  );
}

if (failed) {
  console.error(`\n${failed} over-select fixture(s) failed`);
  process.exit(1);
}
console.log("\nAll over-select paste fixtures green");

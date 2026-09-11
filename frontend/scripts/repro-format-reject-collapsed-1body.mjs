/**
 * Repro: 3 source rows collapsing to 1 body row must be rejected so dual-source can recover.
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
const { formatBodyMatrixLooksCollapsed } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { plainMatrixToHtmlTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

const fields = [
  "SDSPDA95",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
];
const sub = ["Subtotal", ...fields.slice(1)];
const tot = ["Total Amount", ...fields.slice(1)];
const plain = [...fields, ...sub, ...tot].join("\n");

// Synthetic collapsed matrix: 3 source TRs → wrongly 1 body row / 1 stacked cell
const fakeSourceRows = [{}, {}, {}];
const collapsedMatrix = [
  [
    {
      value: fields.concat(sub, tot).join("\n"),
      html: fields.concat(sub, tot).map((v) => `<div>${v}</div>`).join(""),
    },
  ],
];

const plainMatrix = parsePlainTextMatrix(plain);
const rebuilt = plainMatrixToHtmlTable(plainMatrix);
const structure = parseFormatHtmlTableStructure(rebuilt);
const goodMatrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

const checks = {
  rejectsCollapsed: formatBodyMatrixLooksCollapsed(collapsedMatrix, fakeSourceRows) === true,
  acceptsGood3x9: formatBodyMatrixLooksCollapsed(goodMatrix, structure.dataRows) === false,
  plainMulti: (plainMatrix?.[0]?.length || 0) >= 9 && plainMatrix.length === 3,
  goodPipe: (goodMatrix[0] || []).map((c) => c.value).join("|").startsWith(fields.join("|")),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, goodFilled: goodMatrix.map((r) => r.filter((c) => String(c.value || "").trim()).length) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS reject collapsed 1-body + accept reshaped 3×9");

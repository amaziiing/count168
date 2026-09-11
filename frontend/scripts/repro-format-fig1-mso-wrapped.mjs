/**
 * Fig1 visual: maxCols inflated / fake-wide, col0 holds full stacked HTML,
 * cols 1..n empty. Must expand to real 3×9.
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
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);

const fields = (vals) =>
  vals
    .map((v, i) => {
      if (i === 0) return `<span style="display:block;color:#82b8b9"><a href="#">${v}</a></span>`;
      if (i === vals.length - 1) return `<span style="display:block;color:#82c751">${v}</span>`;
      return `<span style="display:block">${v}</span>`;
    })
    .join("");

const vals = [
  "SDSPDA85",
  "7,182",
  "$0.00",
  "$12,390.96",
  "$12,390.96",
  "$10,036.00",
  "$12,390.96",
  "$0.00",
  "$1,584.86",
];

function wrappedRow(rowVals) {
  return `<tr><td><p class="MsoNormal">${fields(rowVals)}</p></td></tr>`;
}

const html = `<table><tbody>${wrappedRow(vals)}${wrappedRow([
  "SUBTOTAL",
  ...vals.slice(1),
])}${wrappedRow(["TOTAL AMOUNT", ...vals.slice(1)])}</tbody></table>`;

const sanitized = sanitizePastedHTML(html) || html;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

const filledCols = (row) =>
  (row || []).filter((c) => String(c?.value || "").trim() || String(c?.html || "").trim()).length;

const checks = {
  rows3: matrix.length === 3,
  cols9: (matrix[0]?.length || 0) >= 9,
  agentOnlyInCol0: String(matrix[0]?.[0]?.value || "") === "SDSPDA85",
  col1IsBetCount: String(matrix[0]?.[1]?.value || "") === "7,182",
  greenLast: /#82c751/.test(String(matrix[0]?.[8]?.styleCssText || matrix[0]?.[8]?.html || "")),
  notStackedDump: !String(matrix[0]?.[0]?.html || "").includes("$0.00"),
  filledEnough: filledCols(matrix[0]) >= 9,
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      maxCols: structure.maxCols,
      filled: matrix.map(filledCols),
      sample: matrix.map((r) => r.map((c) => String(c.value || "").slice(0, 16))),
      html0: String(matrix[0]?.[0]?.html || "").slice(0, 160),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS wrapped MsoNormal spans → fig2");

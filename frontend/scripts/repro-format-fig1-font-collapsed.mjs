/**
 * Fig1 symptom: report row collapsed into one TD as adjacent <font>/<a> blocks
 * (Chrome clipboard often strips mat-* tags). Must expand to 3×9 like Fig2.
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
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);

function fields(agent) {
  return [
    agent,
    "7,182",
    "$0.00",
    "$12,390.96",
    "$12,390.96",
    "$10,036.00",
    "$12,390.96",
    "$0.00",
    "$1,584.86",
  ];
}

function fontRow(vals, { link = false, green = false, bold = false } = {}) {
  // No whitespace between tags — common in Word/Chrome HTML fragments.
  const inner = vals
    .map((v, i) => {
      if (i === 0 && link) return `<font color="#82b8b9"><a href="#">${v}</a></font>`;
      if (i === vals.length - 1 && green) return `<font color="#82c751">${v}</font>`;
      if (bold) return `<font><b>${v}</b></font>`;
      return `<font>${v}</font>`;
    })
    .join("");
  return `<tr><td>${inner}</td></tr>`;
}

const html = `<table><tbody>${fontRow(fields("SDSPDA85"), {
  link: true,
  green: true,
})}${fontRow(fields("SUBTOTAL"), { bold: true })}${fontRow(fields("TOTAL AMOUNT"), {
  bold: true,
})}</tbody></table>`;

const normalized = normalizeClipboardHtmlToTable(html) || html;
const sanitized = sanitizePastedHTML(normalized) || normalized;
const structure = parseFormatHtmlTableStructure(sanitized);
if (!structure) {
  console.error("FAIL: no structure");
  process.exit(1);
}
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const cols = matrix[0]?.length || 0;
const sample = matrix.map((row) => row.map((cell) => String(cell.value || "").slice(0, 24)));
const firstHtml = String(matrix[0]?.[0]?.html || "");
const dumped =
  cols <= 1 ||
  (firstHtml.includes("<font") && firstHtml.includes("$0.00") && firstHtml.includes("7,182"));

const checks = {
  rows3: matrix.length === 3,
  cols9: cols >= 9,
  agent: sample[0]?.[0] === "SDSPDA85",
  subtotal: String(sample[1]?.[0] || "").toUpperCase() === "SUBTOTAL",
  notFig1Dump: !dumped,
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      maxCols: structure.maxCols,
      cols,
      sample,
      firstHtmlPreview: firstHtml.slice(0, 160),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS format fig1 font-collapsed → fig2");

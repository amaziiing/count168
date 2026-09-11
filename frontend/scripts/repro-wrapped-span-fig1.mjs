/**
 * Dual-source fail path: extractPlainFieldDumpFromHtml collapses each outer TD
 * to one spaced line → only 3 lines → not multi-col → HTML dump becomes Fig1.
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
const { extractPlainFieldDumpFromHtml, formatHtmlLooksLikeVerticalNx1 } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

// Simulate Chrome paste: custom elements gone; ONE span per field but
// wrap so expandCollapsed cannot see them as children of TD (inner wrapper).
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

// Inner <p> wrapper: TD has ONE child, so kids.length < 2;
// spans are not direct children of TD.
function wrappedRow(vals) {
  return `<tr><td><p class="MsoNormal">${fields(vals)}</p></td></tr>`;
}

const html = `<table><tbody>${wrappedRow(vals)}${wrappedRow([
  "SUBTOTAL",
  ...vals.slice(1),
])}${wrappedRow(["TOTAL AMOUNT", ...vals.slice(1)])}</tbody></table>`;

const extracted = extractPlainFieldDumpFromHtml(html);
const matrix = parsePlainTextMatrix(extracted);
const structure = parseFormatHtmlTableStructure(html);
const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

console.log(
  JSON.stringify(
    {
      nx1: formatHtmlLooksLikeVerticalNx1(html),
      extractedLines: extracted.split("\n").length,
      extractedPreview: extracted.split("\n").slice(0, 5),
      plainShape: [matrix?.length, matrix?.[0]?.length],
      bodyShape: [body.length, body[0]?.length],
      html0: String(body[0]?.[0]?.html || "").slice(0, 200),
      value0: String(body[0]?.[0]?.value || "").slice(0, 80),
    },
    null,
    2,
  ),
);

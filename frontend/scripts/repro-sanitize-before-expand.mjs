/**
 * Reproduce sanitize stripping .mat-cell BEFORE expand (Fig1).
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

function rowHtml(vals, { link = false, green = false } = {}) {
  const cells = vals
    .map((v, i) => {
      const positive = i === vals.length - 1 && green ? " positive" : "";
      const style =
        i === 0 && link
          ? ' style="color:#82b8b9"'
          : i === vals.length - 1 && green
            ? ' style="color:#82c751"'
            : "";
      const body = i === 0 && link ? `<a href="#">${v}</a>` : v;
      // Chrome-like: div.mat-cell inside ONE td (normalize not run).
      return `<div class="mat-cell${positive}" role="gridcell"${style}>${body}</div>`;
    })
    .join("");
  return `<tr><td>${cells}</td></tr>`;
}

const raw = `<table><tbody>${rowHtml(vals, { link: true, green: true })}${rowHtml(
  ["SUBTOTAL", ...vals.slice(1)],
)}${rowHtml(["TOTAL AMOUNT", ...vals.slice(1)])}</tbody></table>`;

// Bug path: sanitize BEFORE normalize (or normalize returns raw).
const sanitizedOnly = sanitizePastedHTML(raw);
console.log("after sanitize sample cell:", sanitizedOnly?.slice(0, 400));

const structure = parseFormatHtmlTableStructure(sanitizedOnly);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
console.log(
  JSON.stringify(
    {
      maxCols: structure.maxCols,
      shape: [matrix.length, matrix[0]?.length],
      sample: matrix.map((r) => r.map((c) => String(c.value || "").slice(0, 20))),
      html0: String(matrix[0]?.[0]?.html || "").slice(0, 180),
      fig1: (matrix[0]?.length || 0) <= 1,
    },
    null,
    2,
  ),
);

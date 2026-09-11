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
const rows = [vals, ["SUBTOTAL", ...vals.slice(1)], ["TOTAL AMOUNT", ...vals.slice(1)]];

const html = `<table><tbody>${rows
  .map(
    (row) =>
      `<tr><td><table>${row
        .map((v, i) => {
          const style =
            i === 0
              ? ' style="color:#82b8b9"'
              : i === row.length - 1
                ? ' style="color:#82c751"'
                : "";
          return `<tr><td${style}>${i === 0 ? `<a href="#">${v}</a>` : v}</td></tr>`;
        })
        .join("")}</table></td></tr>`,
  )
  .join("")}</tbody></table>`;

const sanitized =
  sanitizePastedHTML(normalizeClipboardHtmlToTable(html) || html) || html;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

console.log(
  JSON.stringify(
    {
      maxCols: structure.maxCols,
      shape: [matrix.length, matrix[0]?.length],
      rows: matrix.map((r) =>
        r.map((c) => ({
          v: String(c.value || "").slice(0, 40),
          hasHtml: Boolean(c.html),
        })),
      ),
    },
    null,
    2,
  ),
);

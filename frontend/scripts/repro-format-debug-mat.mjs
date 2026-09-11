/**
 * Debug: mat-row + plain reshape; stacked one-td; tryProcess preference order.
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../package.json"));
const { parseHTML: ph } = { parseHTML };
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  DOMParser: window.DOMParser,
});

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { formatBodyMatrixLooksCollapsed } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { formatHtmlLooksLikeVerticalNx1, extractPlainFieldDumpFromHtml } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
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
const plain = [...fields, ...sub].join("\n");

function matRow(vals) {
  return (
    "<mat-row>" +
    vals
      .map((v, i) => {
        const cls = i === 8 ? ' class="positive"' : "";
        const inner = i === 0 ? `<a href="#">${v}</a>` : v;
        return `<mat-cell${cls}>${inner}</mat-cell>`;
      })
      .join("") +
    "</mat-row>"
  );
}

const raw = matRow(fields) + matRow(sub);
const normalized = normalizeClipboardHtmlToTable(raw);
const st = parseFormatHtmlTableStructure(normalized);
const body = buildFormatBodyMatrix(st.dataRows, st.maxCols);
const filled = (r) => (r || []).filter((c) => String(c?.value || "").trim()).length;

console.log(
  JSON.stringify(
    {
      nx1: formatHtmlLooksLikeVerticalNx1(normalized),
      maxCols: st.maxCols,
      bodyRows: body.length,
      filled: body.map(filled),
      collapsed: formatBodyMatrixLooksCollapsed(body, st.dataRows),
      plain: parsePlainTextMatrix(plain),
      extractHead: extractPlainFieldDumpFromHtml(raw).split("\n").slice(0, 3),
    },
    null,
    2,
  ),
);

const stack = (arr) => arr.map((v) => `<div>${v}</div>`).join("");
const bad = `<table><tr><td>${stack(fields)}</td></tr><tr><td>${stack(["SUBTOTAL", ...fields.slice(1)])}</td></tr></table>`;
const st2 = parseFormatHtmlTableStructure(bad);
const body2 = buildFormatBodyMatrix(st2.dataRows, st2.maxCols);
console.log(
  "stacked",
  JSON.stringify(
    {
      filled: body2.map(filled),
      first: (body2[0] || []).map((c) => c.value),
      collapsed: formatBodyMatrixLooksCollapsed(body2, st2.dataRows),
    },
    null,
    2,
  ),
);

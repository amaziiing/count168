import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  DOMParser: window.DOMParser,
});

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const text = await import(pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href);
const preview = await import(pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href);
const matrix = await import(pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href);
const htmlP = await import(pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href);
const norm = await import(pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href);

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
const plainFix = fields.concat(["Subtotal", ...fields.slice(1)]).join("\n");
const m = text.parsePlainTextMatrix(plainFix);

function matHtml(vals) {
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

const raw = matHtml(fields) + matHtml(["Subtotal", ...fields.slice(1)]);
const styled = preview.plainMatrixToStyledHtmlTable(m, raw);
const sanitized = preview.sanitizePastedHTML(styled);
const st = matrix.parseFormatHtmlTableStructure(sanitized || styled);
const body = matrix.buildFormatBodyMatrix(st.dataRows, st.maxCols);
const filled = (r) => (r || []).filter((c) => String(c?.value || "").trim()).length;
console.log(
  "dual->sanitize",
  JSON.stringify({
    rows: body.length,
    filled: body.map(filled),
    collapsed: htmlP.formatBodyMatrixLooksCollapsed(body, st.dataRows),
  }),
);

const normalized = norm.normalizeClipboardHtmlToTable(raw);
const san2 = preview.sanitizePastedHTML(normalized);
const st2 = matrix.parseFormatHtmlTableStructure(san2 || normalized);
const body2 = matrix.buildFormatBodyMatrix(st2.dataRows, st2.maxCols);
console.log(
  "norm->sanitize",
  JSON.stringify({
    maxCols: st2.maxCols,
    filled: body2.map(filled),
    first: (body2[0] || []).map((c) => c.value),
  }),
);

// Browser-like: Word wraps mat cells into ONE td with <br>
const brRow = (vals) => `<tr><td>${vals.map((v, i) => (i === 0 ? `<a href="#">${v}</a>` : v)).join("<br>")}</td></tr>`;
const brHtml = `<table>${brRow(fields)}${brRow(["SUBTOTAL", ...fields.slice(1)])}</table>`;
const st3 = matrix.parseFormatHtmlTableStructure(brHtml);
const body3 = matrix.buildFormatBodyMatrix(st3.dataRows, st3.maxCols);
console.log(
  "br-collapsed",
  JSON.stringify({
    filled: body3.map(filled),
    first: (body3[0] || []).map((c) => c.value),
    collapsed: htmlP.formatBodyMatrixLooksCollapsed(body3, st3.dataRows),
  }),
);

// Excel: each field is its OWN tr (true Nx1) — dual should reshape
const nx1 = fields
  .concat(["Subtotal", ...fields.slice(1)])
  .map((v) => `<tr><td>${v}</td></tr>`)
  .join("");
const nx1Html = `<table>${nx1}</table>`;
console.log("nx1 detect", /table/.test(nx1Html));
const { formatHtmlLooksLikeVerticalNx1 } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
);
console.log("nx1 flag", formatHtmlLooksLikeVerticalNx1(nx1Html), "plain", m.length, m[0]?.length);

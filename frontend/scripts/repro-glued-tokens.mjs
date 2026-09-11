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

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { tokenizeCollapsedReportRow } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

const glued = "SDSPDA857,182$0.00$12,390.96$12,390.96$10,036.00$12,390.96$0.00$1,584.86";
console.log("tokenize glued", tokenizeCollapsedReportRow(glued));

// Single text node per cell — no child elements
const html = `<table><tbody>
<tr><td>${glued}</td></tr>
<tr><td>SUBTOTAL7,182$0.00$12,390.96$12,390.96$10,036.00$12,390.96$0.00$1,584.86</td></tr>
<tr><td>TOTAL AMOUNT7,182$0.00$12,390.96$12,390.96$10,036.00$12,390.96$0.00$1,584.86</td></tr>
</tbody></table>`;

const st = parseFormatHtmlTableStructure(html);
const matrix = buildFormatBodyMatrix(st.dataRows, st.maxCols);
console.log({
  maxCols: st.maxCols,
  shape: [matrix.length, matrix[0]?.length],
  sample: matrix.map((r) => r.map((c) => String(c.value || "").slice(0, 48))),
  html0: String(matrix[0]?.[0]?.html || "").slice(0, 80),
});

// Styled blocks as ONE text with <br> between — should expand
const brHtml = `<table><tbody><tr><td><a style="color:#82b8b9" href="#">SDSPDA85</a><br>7,182<br>$0.00<br>$12,390.96<br>$12,390.96<br>$10,036.00<br>$12,390.96<br>$0.00<br><span style="color:#82c751">$1,584.86</span></td></tr>
<tr><td><b>SUBTOTAL</b><br>7,182<br>$0.00<br>$12,390.96<br>$12,390.96<br>$10,036.00<br>$12,390.96<br>$0.00<br>$1,584.86</td></tr>
<tr><td><b>TOTAL AMOUNT</b><br>7,182<br>$0.00<br>$12,390.96<br>$12,390.96<br>$10,036.00<br>$12,390.96<br>$0.00<br>$1,584.86</td></tr></tbody></table>`;
const st2 = parseFormatHtmlTableStructure(brHtml);
const m2 = buildFormatBodyMatrix(st2.dataRows, st2.maxCols);
console.log("br", {
  shape: [m2.length, m2[0]?.length],
  sample: m2.map((r) => r.map((c) => String(c.value || "").slice(0, 20))),
});

/**
 * Format: wide row with stacked dump in TD0 + empty sibling TDs must become 3×9.
 * Also: tryProcess must fall through to dual-source when HTML fill rejects collapse.
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
const { formatBodyMatrixLooksCollapsed, parseAndFillHtmlTableForFormat } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { plainMatrixToStyledHtmlTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
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

const stack = (arr) => arr.map((v) => `<div>${v}</div>`).join("");
const wide = (arr) => `<tr><td>${stack(arr)}</td>${"<td></td>".repeat(8)}</tr>`;
const badHtml = `<table><tbody>${wide(fields)}${wide(sub)}${wide(tot)}</tbody></table>`;

const sanitized = sanitizePastedHTML(badHtml) || badHtml;
const structure = parseFormatHtmlTableStructure(sanitized);
const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const filled = (row) => (row || []).filter((c) => String(c?.value || "").trim()).length;

const checks = {
  expanded3x9: body.length === 3 && filled(body[0]) >= 9,
  agent: String(body[0]?.[0]?.value || "") === "SDSPDA95",
  bet: String(body[0]?.[1]?.value || "") === "7,182",
  notCollapsed: formatBodyMatrixLooksCollapsed(body, structure.dataRows) === false,
};

// Dual-source still builds correct table from plain when HTML alone was trash historically.
const dual = plainMatrixToStyledHtmlTable(parsePlainTextMatrix(plain), badHtml);
const dualStructure = parseFormatHtmlTableStructure(sanitizePastedHTML(dual) || dual);
const dualBody = buildFormatBodyMatrix(dualStructure.dataRows, dualStructure.maxCols);

const dualChecks = {
  dual3x9: dualBody.length === 3 && filled(dualBody[0]) >= 9,
  dualPipe: (dualBody[0] || []).map((c) => c.value).join("|").startsWith(fields.join("|")),
};

const ok = Object.values(checks).every(Boolean) && Object.values(dualChecks).every(Boolean);
console.log(JSON.stringify({ ok, checks, dualChecks, filled: body.map(filled) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS format wide-empty expand + dual-source");

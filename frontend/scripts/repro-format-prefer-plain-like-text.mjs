/**
 * 2.FORMAT must prefer 1.TEXT-style plain reshape (dual-source) so agent_period
 * field-per-line dumps land as Fig2 pipe order — not HTML-first Fig1 col1 stack.
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
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { plainMatrixToStyledHtmlTable, sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { formatBodyMatrixLooksCollapsed } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
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
const plain = [...fields, ...sub, ...tot].join("\r\n");

// Fig1-like HTML: 3 wide rows, only first TD filled with nested stacks
const stack = (arr) => arr.map((v) => `<div>${v}</div>`).join("");
const wide = (arr) => `<tr><td>${stack(arr)}</td>${"<td></td>".repeat(8)}</tr>`;
const badHtml = `<table><tbody>${wide(fields)}${wide(sub)}${wide(tot)}</tbody></table>`;

const plainMatrix = parsePlainTextMatrix(plain);
const dualHtml = plainMatrixToStyledHtmlTable(plainMatrix, badHtml) || "";
const dualSanitized = sanitizePastedHTML(dualHtml) || dualHtml;
const dualStructure = parseFormatHtmlTableStructure(dualSanitized);
const dualBody = buildFormatBodyMatrix(dualStructure.dataRows, dualStructure.maxCols);

const badSanitized = sanitizePastedHTML(badHtml) || badHtml;
const badStructure = parseFormatHtmlTableStructure(badSanitized);
const badBody = buildFormatBodyMatrix(badStructure.dataRows, badStructure.maxCols);

const pipe = (matrix, row = 0) =>
  (matrix[row] || []).map((c) => String(c?.value || "")).join("|");

const checks = {
  plainIs3x9: plainMatrix.length === 3 && (plainMatrix[0]?.length || 0) >= 9,
  dualPipe: pipe(dualBody).startsWith(fields.join("|")),
  dualNotCollapsed: formatBodyMatrixLooksCollapsed(dualBody, dualStructure.dataRows) === false,
  // After HtmlMatrix expand restore, even bad HTML should expand — or be rejected
  badExpandedOrRejected:
    (badBody.length === 3 && (badBody[0] || []).filter((c) => String(c?.value || "").trim()).length >= 9) ||
    formatBodyMatrixLooksCollapsed(badBody, badStructure.dataRows) === true,
  agent: String(dualBody[0]?.[0]?.value || "") === "SDSPDA95",
  subtotal: String(dualBody[1]?.[0]?.value || "").toUpperCase().includes("SUBTOTAL"),
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      dualPipe: pipe(dualBody),
      badFilled: badBody.map((r) => (r || []).filter((c) => String(c?.value || "").trim()).length),
      dualFilled: dualBody.map((r) => (r || []).filter((c) => String(c?.value || "").trim()).length),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS format prefers plain reshape (=1.TEXT / Fig2)");

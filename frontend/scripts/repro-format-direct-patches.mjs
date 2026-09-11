/**
 * Format must prefer plain dual-source and apply patches so A1/B1 stacks become 2×9.
 */
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
const preview = await import(pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href);
const text = await import(pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href);
const htmlP = await import(pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href);

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
const plain = fields.concat(["Subtotal", ...fields.slice(1)]).join("\n");
const matrix = text.parsePlainTextMatrix(plain);
const patches = preview.plainMatrixToFormatCellPatches(matrix, "");
const filled = (row) => (row || []).filter((c) => String(c?.value || "").trim()).length;

const stackHtml = fields.map((v) => `<div>${v}</div>`).join("");
const badHtml = `<table><tr><td>${stackHtml}</td></tr><tr><td>${["SUBTOTAL", ...fields.slice(1)]
  .map((v) => `<div>${v}</div>`)
  .join("")}</td></tr></table>`;

const checks = {
  matrix2x9: matrix.length === 2 && matrix[0].length === 9,
  patches2x9: patches.length === 2 && filled(patches[0]) === 9,
  patchesNotCollapsed: htmlP.formatBodyMatrixLooksCollapsed(patches, null) === false,
  agentLink: String(patches[0]?.[0]?.html || "").includes("SDSPDA95"),
  greenNet: /82c751/.test(String(patches[0]?.[8]?.styleCssText || patches[0]?.[8]?.html || "")),
};

// Heal path: stacked body → reshape
const stackedBody = [
  [
    {
      value: fields.join("\n"),
      html: stackHtml,
    },
  ],
  [
    {
      value: ["SUBTOTAL", ...fields.slice(1)].join("\n"),
      html: ["SUBTOTAL", ...fields.slice(1)].map((v) => `<div>${v}</div>`).join(""),
    },
  ],
];
const wasCollapsed = htmlP.formatBodyMatrixLooksCollapsed(stackedBody, [1, 2]) === true;

const ok = Object.values(checks).every(Boolean) && wasCollapsed;
console.log(JSON.stringify({ ok, checks, wasCollapsed, filled: patches.map(filled) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS format dual-source direct patches");

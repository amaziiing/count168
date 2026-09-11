/**
 * Fig1 repro: agent is bare <a>, amounts are sibling <div>s — collectNested
 * only grabbed divs, looksLike saw money-first → dumped whole TD into col1.
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

function row(vals, { agentLink = false, green = false, bold = false } = {}) {
  const parts = vals.map((v, i) => {
    if (i === 0 && agentLink) {
      return `<a href="#" style="color:#82b8b9">${v}</a>`;
    }
    if (i === vals.length - 1 && green) {
      return `<div style="color:#82c751">${v}</div>`;
    }
    if (bold) return `<div><b>${v}</b></div>`;
    return `<div>${v}</div>`;
  });
  return `<tr><td>${parts.join("")}</td></tr>`;
}

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

const html = `<table><tbody>${row(vals, { agentLink: true, green: true })}${row(
  ["SUBTOTAL", ...vals.slice(1)],
  { bold: true },
)}${row(["TOTAL AMOUNT", ...vals.slice(1)], { bold: true })}</tbody></table>`;

const sanitized = sanitizePastedHTML(html) || html;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const cols = matrix[0]?.length || 0;
const html0 = String(matrix[0]?.[0]?.html || "");
const fig1 =
  cols <= 1 &&
  html0.includes("7,182") &&
  (html0.includes("#82b8b9") || html0.includes("#82c751"));

const checks = {
  rows3: matrix.length === 3,
  cols9: cols >= 9,
  agent: String(matrix[0]?.[0]?.value || "") === "SDSPDA85",
  notFig1: !fig1,
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      cols,
      sample: matrix.map((r) => r.map((c) => String(c.value || "").slice(0, 20))),
      html0: html0.slice(0, 220),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS fig1 a+div → fig2");

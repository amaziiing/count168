/**
 * Fig1 multi-col report: each mat-row = agent + N amounts (same row).
 * Must NOT become Fig2 跑位 (agent alone on row A, numbers on row B).
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
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const {
  formatBodyMatrixLooksIdNumberSplit,
  formatPlainMatrixLooksIdNumberSplit,
  formatBodyMatrixLooksCollapsed,
} = await import(pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

const amounts = [
  "-1,707.77",
  "2,307.80",
  "2,307.80",
  "1,820.82",
  "0.00",
  "-473.41",
  "0.00",
  "0.00",
  "1,347.41",
  "486.98",
  "0.00",
  "-126.61",
  "360.36",
];

function matRow(agent, nums, { negativeFirst = true } = {}) {
  const agentCell = `<mat-cell class="mat-cell"><a href="#">${agent}</a></mat-cell>`;
  const numCells = nums
    .map((n, i) => {
      const neg = String(n).includes("-");
      const cls = neg && (negativeFirst || i > 0) ? "negative" : "";
      return `<mat-cell class="mat-cell ${cls}">${n}</mat-cell>`;
    })
    .join("");
  return `<mat-row class="mat-row" role="row">${agentCell}${numCells}</mat-row>`;
}

const html = [
  matRow("AW9966", amounts),
  matRow("AWZ66", ["-11,085.21", ...amounts.slice(1)]),
  matRow("BSAM2424", amounts),
].join("");

const normalized = normalizeClipboardHtmlToTable(html);
const sanitized = sanitizePastedHTML(normalized) || normalized;
const structure = parseFormatHtmlTableStructure(sanitized);
const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

const fig2Broken = [
  ["AW9966"],
  amounts,
  ["AWZ66"],
  ["-11,085.21", ...amounts.slice(1)],
];

const goodPipe = ["AW9966", ...amounts].join("|");
const gotPipe = (body[0] || []).map((c) => String(c?.value || "")).join("|");

const checks = {
  rows3: body.length === 3,
  cols14: (body[0] || []).filter((c) => String(c?.value || "").trim()).length >= 14,
  agentWithNums: String(body[0]?.[0]?.value || "") === "AW9966",
  secondIsAmount: String(body[0]?.[1]?.value || "") === "-1,707.77",
  notIdNumberSplit: formatBodyMatrixLooksIdNumberSplit(body) === false,
  notCollapsed: formatBodyMatrixLooksCollapsed(body, structure.dataRows) === false,
  detectsFig2Plain: formatPlainMatrixLooksIdNumberSplit(fig2Broken) === true,
  pipeStarts: gotPipe.startsWith(goodPipe.slice(0, 20)),
  linkStyle: /82b8b9|underline|color/i.test(String(body[0]?.[0]?.styleCssText || body[0]?.[0]?.html || "")),
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      gotPipe: gotPipe.slice(0, 120),
      filled: body.map((r) => (r || []).filter((c) => String(c?.value || "").trim()).length),
      sample: body.map((r) => (r || []).slice(0, 4).map((c) => String(c?.value || ""))),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS format multi-col mat-row 1:1 (no Fig2 id/number split)");

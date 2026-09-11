/**
 * Screenshot failure: each report row collapsed into ONE td with nested mat-cells /
 * br-separated fields → must expand to 3×9 with green Net Win Loss.
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

function rowHtml(fields) {
  return `<tr><td>${fields
    .map((f) => {
      if (f.positive) return `<mat-cell class="positive">${f.text}</mat-cell>`;
      if (f.link) return `<mat-cell class="mat-cell"><a href="#">${f.text}</a></mat-cell>`;
      return `<mat-cell class="mat-cell">${f.text}</mat-cell>`;
    })
    .join("")}</td></tr>`;
}

const agent = [
  { text: "SDSPDA95", link: true },
  { text: "7,182" },
  { text: "$0.00" },
  { text: "$12,390.95" },
  { text: "$12,390.95" },
  { text: "$10,806.00" },
  { text: "$12,390.95" },
  { text: "$0.00" },
  { text: "$1,584.95", positive: true },
];
const sub = [{ text: "Subtotal" }, ...agent.slice(1)];
const total = [{ text: "Total Amount" }, ...agent.slice(1)];

const html = `<table><tbody>${rowHtml(agent)}${rowHtml(sub)}${rowHtml(total)}</tbody></table>`;

const structure = parseFormatHtmlTableStructure(html);
const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);

const checks = {
  rows: body.length === 3,
  cols: body[0]?.length === 9,
  agent: body[0]?.[0]?.value?.includes("SDSPDA95"),
  subtotal: body[1]?.[0]?.value === "Subtotal",
  green:
    /#82c751|rgb\(0,\s*200,\s*83\)|rgb\(130,\s*199,\s*81\)/.test(
      `${body[0]?.[8]?.styleCssText || ""} ${body[0]?.[8]?.html || ""}`,
    ),
  link:
    /#82b8b9|rgb\(33,\s*150,\s*243\)|<a\b/i.test(
      `${body[0]?.[0]?.styleCssText || ""} ${body[0]?.[0]?.html || ""}`,
    ),
  notSingleCellDump: !(body.length === 3 && body[0]?.length === 1),
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      sample: body.map((r) => r.map((c) => c.value)),
      styles: body[0]?.map((c) => ({ v: c.value, s: (c.styleCssText || "").slice(0, 60), h: (c.html || "").slice(0, 40) })),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS format one-td nested 1:1 expand");

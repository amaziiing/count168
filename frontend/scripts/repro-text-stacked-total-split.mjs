/**
 * Screenshot: label + every numeric cell stacks two lines in one row.
 * Also: value glued without newlines but html has two block kids.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { splitStackedSubtotalGrandTotalRows } = await import(
  pathToFileURL(path.join(base, "dataCaptureStackedTotalSplit.js")).href,
);

const htmlStacked = [
  [
    {
      value: "SUBTOTALGRANDTOTAL",
      html: "<div>SUB TOTAL</div><div>GRAND TOTAL</div>",
    },
    { value: "" },
    { value: "" },
    {
      value: "1814018140",
      html: "<div>18140</div><div>18140</div>",
    },
    {
      value: "7,371,689.647,371,689.64",
      html: "<div>7,371,689.64</div><div>7,371,689.64</div>",
    },
  ],
];

const newlineStacked = [
  ["1", "OB", "RS"],
  ["SUB TOTAL\nGRAND TOTAL", "", "18140\n18140"],
];

const a = splitStackedSubtotalGrandTotalRows(htmlStacked);
const b = splitStackedSubtotalGrandTotalRows(newlineStacked);

const checks = {
  htmlRows: a.length === 2,
  htmlSub: a[0][0].value === "SUB TOTAL",
  htmlGrand: a[1][0].value === "GRAND TOTAL",
  htmlNum: a[0][3].value === "18140" && a[1][3].value === "18140",
  htmlNoStackHtml: a[0][0].html === undefined && a[0][3].html === undefined,
  nlRows: b.length === 3,
  nlSub: b[1][0] === "SUB TOTAL",
  nlGrand: b[2][0] === "GRAND TOTAL",
  nlNum: b[1][2] === "18140" && b[2][2] === "18140",
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, a, b }, null, 2));
if (!ok) process.exit(1);
console.log("PASS stacked totals (html + numeric double lines)");

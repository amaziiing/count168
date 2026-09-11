/**
 * Format HTML with stacked SUBTOTAL/GRANDTOTAL — same shape TEXT already splits —
 * must become two full-width rows (not a 2-col stair-step).
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
const { buildFormatBodyMatrix, parseFormatHtmlTableStructure } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { splitStackedSubtotalGrandTotalRows } = await import(
  pathToFileURL(path.join(base, "dataCaptureStackedTotalSplit.js")).href,
);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);

function stack2(a, b) {
  return `<td>${a}<br>${b}</td>`;
}

// Header + 1 data row + stacked totals (how Excel copies report footers)
const html = `<table>
<tr><th>No</th><th>Code</th><th>Name</th><th>Count</th><th>Amount</th></tr>
<tr><td>1</td><td><a href="#">OB</a></td><td>RS</td><td>9714</td><td>7,054,992.00</td></tr>
<tr>${stack2("SUBTOTAL", "GRAND TOTAL")}<td></td><td></td>${stack2("18140", "18140")}${stack2("7,371,689.64", "7,371,689.64")}</tr>
</table>`;

const sanitized = sanitizePastedHTML(html) || html;
const structure = parseFormatHtmlTableStructure(sanitized);
let body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
body = splitStackedSubtotalGrandTotalRows(body);

const vals = (row) => (row || []).map((c) => String(c?.value ?? c ?? "").trim());
const sub = body.find((row) => /^SUB\s*TOTAL$/i.test(vals(row)[0] || ""));
const grand = body.find((row) => /^GRAND\s*TOTAL$/i.test(vals(row)[0] || ""));

const checks = {
  hasDataRow: body.some((row) => vals(row)[0] === "1"),
  hasSub: Boolean(sub),
  hasGrand: Boolean(grand),
  subCount: sub && vals(sub).includes("18140"),
  grandCount: grand && vals(grand).includes("18140"),
  subAmount: sub && vals(sub).some((v) => v.includes("7,371,689.64")),
  grandAmount: grand && vals(grand).some((v) => v.includes("7,371,689.64")),
  // Not stair-step: subtotal row should be wider than 2 filled cols
  subWide: sub && vals(sub).filter(Boolean).length >= 3,
  grandWide: grand && vals(grand).filter(Boolean).length >= 3,
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      rows: body.map(vals),
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS format stacked subtotal/grandtotal like TEXT");

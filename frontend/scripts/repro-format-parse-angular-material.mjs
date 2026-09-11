/**
 * parseAngularMaterialTable: mat/cdk/role=grid → real <table>, styles baked,
 * agent + amounts stay on one row (visual clone).
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
const {
  clipboardHtmlLooksLikeAngularMaterial,
  parseAngularMaterialTable,
} = await import(pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href);
const { sanitizePastedHTML } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);
const { formatBodyMatrixLooksIdNumberSplit } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlPaste.js")).href,
);

const html = `<!--StartFragment-->
<style>.positive{color:#82c751}.negative{color:#ff7575}a{color:#82b8b9}</style>
<div role="grid">
  <div class="mat-row" role="row">
    <div class="mat-cell cdk-column-agent" role="gridcell"><a href="#">AW9966</a></div>
    <div class="mat-cell positive" role="gridcell">$10.00</div>
    <div class="mat-cell negative" role="gridcell">-$2.00</div>
  </div>
  <div class="mat-row" role="row">
    <div class="mat-cell" role="gridcell">Subtotal</div>
    <div class="mat-cell positive" role="gridcell">$10.00</div>
    <div class="mat-cell negative" role="gridcell">-$2.00</div>
  </div>
</div>
<!--EndFragment-->`;

const looks = clipboardHtmlLooksLikeAngularMaterial(html);
const parsed = parseAngularMaterialTable(html);
const sanitized = sanitizePastedHTML(parsed) || parsed;
const structure = parseFormatHtmlTableStructure(sanitized);
const matrix = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const row0 = (matrix[0] || []).map((c) => String(c.value || ""));
const style0 = String(matrix[0]?.[0]?.styleCssText || matrix[0]?.[0]?.html || "");
const stylePos = String(matrix[0]?.[1]?.styleCssText || matrix[0]?.[1]?.html || "");
const styleNeg = String(matrix[0]?.[2]?.styleCssText || matrix[0]?.[2]?.html || "");

const checks = {
  looks,
  parsedTable: /<table\b/i.test(parsed || ""),
  rows2: matrix.length === 2,
  cols3: row0.length === 3,
  sameRow: row0[0] === "AW9966" && row0[1] === "$10.00" && row0[2] === "-$2.00",
  noIdSplit: !formatBodyMatrixLooksIdNumberSplit(matrix),
  linkColor: /#82b8b9/.test(style0),
  positive: /#82c751/.test(stylePos),
  negative: /#ff7575/.test(styleNeg),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, row0, sample: matrix.map((r) => r.map((c) => c.value)) }, null, 2));
if (!ok) process.exit(1);
console.log("PASS parseAngularMaterialTable 1:1 clone + styles");

/**
 * Mario Club WIN LOSE PT: multi-row TSV + DataTables HTML (body+foot).
 * Run: node ./scripts/repro-mario-tsv.mjs
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
globalThis.DOMParser = window.DOMParser;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

let failed = 0;

const tsv = [
  ["MCKAP02", "125.99", "-12.12", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "10.61", "0.06", "1.45", "10.61", "0.06", "1.45"].join("\t"),
  ["Total:", "125.99", "-12.12", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "10.61", "0.06", "1.45", "10.61", "0.06", "1.45"].join("\t"),
  ["Grand Total", "125.99", "-12.12", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "10.60", "0.06", "1.45", "10.60", "0.06", "1.45"].join("\t"),
].join("\n");

const m = parsePlainTextMatrix(tsv);
const tsvOk =
  m.length === 3 &&
  m[0][0] === "MCKAP02" &&
  m[1][0] === "Total:" &&
  m[2][0] === "Grand Total" &&
  m[0][2] === "-12.12";
console.log(`${tsvOk ? "PASS" : "FAIL"} mario-tsv-3x17: ${m.length}x${m[0]?.length || 0}`);
if (!tsvOk) failed += 1;

const dataTablesHtml = `
<div class="dataTables_scroll">
  <div class="dataTables_scrollHead"><div class="dataTables_scrollHeadInner">
    <table class="dataTable"><thead><tr>
      <th>Downline Login Id</th><th>Total Turnover</th><th>Total Win Lose</th>
    </tr></thead></table>
  </div></div>
  <div class="dataTables_scrollBody">
    <table class="dataTable">
      <thead><tr><th>Downline Login Id</th><th>Total Turnover</th><th>Total Win Lose</th></tr></thead>
      <tbody>
        <tr><th>Total:</th><th>125.99</th><th>-12.12</th></tr>
        <tr><td></td><td></td><td></td></tr>
        <tr><td>MCKAP02</td><td>125.99</td><td>-12.12</td></tr>
      </tbody>
    </table>
  </div>
  <div class="dataTables_scrollFoot"><div class="dataTables_scrollFootInner">
    <table class="dataTable"><tfoot>
      <tr><th>Total:</th><th>125.99</th><th>-12.12</th></tr>
      <tr><th>Grand Total</th><th>125.99</th><th>-12.12</th></tr>
    </tfoot></table>
  </div></div>
</div>`;

const normalized = normalizeClipboardHtmlToTable(dataTablesHtml);
const structure = parseFormatHtmlTableStructure(normalized);
const body = structure ? buildFormatBodyMatrix(structure.dataRows, structure.maxCols) : [];
const labels = body.map((row) => String(row[0]?.value ?? row[0] ?? "").trim());
const htmlOk =
  body.length === 3 &&
  labels[0] === "MCKAP02" &&
  /^Total:?$/i.test(labels[1]) &&
  /Grand Total/i.test(labels[2]) &&
  String(body[0][2]?.value ?? body[0][2] ?? "").includes("-12.12");
console.log(
  `${htmlOk ? "PASS" : "FAIL"} mario-datatables-html-merge: ${body.length}x${body[0]?.length || 0}`,
  labels,
);
if (!htmlOk) failed += 1;

// All-th Total row alone must still classify as data (not header).
const footOnly = `<table><tr><th>Total:</th><th>1</th><th>2</th><th>3</th></tr><tr><th>Grand Total</th><th>1</th><th>2</th><th>3</th></tr></table>`;
const footStruct = parseFormatHtmlTableStructure(footOnly);
const footOk = footStruct && footStruct.dataRows.length === 2 && footStruct.headerRows.length === 0;
console.log(
  `${footOk ? "PASS" : "FAIL"} all-th-total-rows-are-data: data=${footStruct?.dataRows.length} header=${footStruct?.headerRows.length}`,
);
if (!footOk) failed += 1;

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log("\nAll mario multi-row cases green");

/**
 * Exact DevTools shape: <mat-row> + <mat-cell> (NO <table>).
 * Run: node ./scripts/repro-native-mat-row-paste.mjs
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
const { normalizeClipboardHtmlToTable, clipboardHtmlLooksLikeGrid } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

/** User DevTools: mat-row / mat-cell only — not HTML table. */
const nativeMatRowHtml = `
<html><body>
<!--StartFragment-->
<mat-row class="mat-row ng-star-inserted" role="row">
  <mat-cell class="mat-cell cdk-column-agent_account mat-column-agent_account" role="gridcell">SDSPDA95</mat-cell>
  <mat-cell class="mat-cell cdk-column-bet_count mat-column-bet_count" role="gridcell">6,522</mat-cell>
  <mat-cell class="mat-cell cdk-column-event_amount mat-column-event_amount" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell cdk-column-bet_amount mat-column-bet_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-real_bet_amount mat-column-real_bet_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-payout_amount mat-column-payout_amount" role="gridcell">$9,825.31</mat-cell>
  <mat-cell class="mat-cell cdk-column-valid_amount mat-column-valid_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-fee_amount mat-column-fee_amount" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell positive" role="gridcell">$1,285.44</mat-cell>
</mat-row>
<!--EndFragment-->
</body></html>
`;

const looksLikeGrid = clipboardHtmlLooksLikeGrid(nativeMatRowHtml);
const hasTableInSource = /<table\b/i.test(nativeMatRowHtml);
const normalized = normalizeClipboardHtmlToTable(nativeMatRowHtml);
const hasTableAfter = /<table\b/i.test(normalized);

console.log("source has <table>:", hasTableInSource);
console.log("clipboardHtmlLooksLikeGrid:", looksLikeGrid);
console.log("normalized has <table>:", hasTableAfter);

if (!looksLikeGrid || hasTableInSource || !hasTableAfter) {
  console.error("FAIL preprocess checks");
  process.exit(1);
}

const structure = parseFormatHtmlTableStructure(normalized);
if (!structure) {
  console.error("FAIL no structure after normalize");
  console.log(normalized.slice(0, 500));
  process.exit(1);
}

const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
const cols = body[0]?.length || 0;
const ok = body.length >= 1 && cols >= 8;
console.log(`${ok ? "PASS" : "FAIL"} native-mat-row-no-table: ${body.length}x${cols}`);
console.log("  row0:", body[0]?.map((c) => String(c.value || "").trim()));
if (!ok) process.exit(1);
console.log("\nNative mat-row (non-table) HTML path green");

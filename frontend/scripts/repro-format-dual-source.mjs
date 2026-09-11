/**
 * 2.Format dual-source: N×1 HTML dump + plain vertical field dump → 3×9 with styles.
 * Must not rely on 1.TEXT handlers.
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
const { plainMatrixToStyledHtmlTable, collectFormatStyleHintsFromHtml } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPreview.js")).href,
);
const { formatHtmlLooksLikeVerticalNx1, extractPlainFieldDumpFromHtml } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatPasteHandler.js")).href,
);

const plain = [
  "SDSPDA95",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
  "Subtotal",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
  "Total Amount",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
].join("\n");

const matHtml = `<html><body><!--StartFragment-->
<style>.positive{color:#82c751}a{color:#82b8b9}</style>
<mat-row class="mat-row" role="row">
  <mat-cell class="mat-cell cdk-column-agent_account" role="gridcell"><a href="#">SDSPDA95</a></mat-cell>
  <mat-cell class="mat-cell" role="gridcell">7,182</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$12,390.95</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$12,390.95</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$10,806.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$12,390.95</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="positive" role="gridcell">$1,584.95</mat-cell>
</mat-row>
<!--EndFragment--></body></html>`;

// Simulate failed HTML path: one field per row
const nx1Html = `<table><tbody>${plain
  .split("\n")
  .map((line) => `<tr><td>${line}</td></tr>`)
  .join("")}</tbody></table>`;

const matrix = parsePlainTextMatrix(plain);
const hints = collectFormatStyleHintsFromHtml(matHtml);
const styled = plainMatrixToStyledHtmlTable(matrix, matHtml);

const fromHtmlOnly = extractPlainFieldDumpFromHtml(matHtml);
const fromHtmlMatrix = parsePlainTextMatrix(fromHtmlOnly);

const checks = {
  matrix3x9: matrix.length === 3 && matrix[0].length === 9,
  nx1Detected: formatHtmlLooksLikeVerticalNx1(nx1Html) === true,
  multiNotNx1: formatHtmlLooksLikeVerticalNx1(styled) === false,
  hasPositiveHint: hints.some((h) => h.positive && h.text.includes("1,584.95")),
  hasLinkHint: hints.some((h) => h.hasLink && h.text === "SDSPDA95"),
  styledHasGreen: /#82c751/.test(styled),
  styledHasLink: /#82b8b9/.test(styled) && /<a\b/i.test(styled),
  styledHasSubtotal: /Subtotal/.test(styled),
  extractFromHtmlReshape: fromHtmlMatrix.length >= 1 && fromHtmlMatrix[0].length === 9,
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, hints: hints.length, cols: matrix[0]?.length }, null, 2));
if (!ok) process.exit(1);
console.log("PASS format dual-source agent_period");

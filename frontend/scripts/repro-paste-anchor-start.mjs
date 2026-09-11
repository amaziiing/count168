/**
 * Paste must start at the selected grid cell (row+col), not forced to 0,0.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML(`<!doctype html><html><body>
  <table id="dataTable"><tbody id="tableBody">
    <tr><td contenteditable="true" data-row="0" data-col="0"></td>
        <td contenteditable="true" data-row="0" data-col="3" id="cellA4"></td></tr>
    <tr><td contenteditable="true" data-row="2" data-col="1" id="cellC2"></td>
        <td contenteditable="true" data-row="2" data-col="1"></td></tr>
  </tbody></table>
</body></html>`);
Object.assign(globalThis, {
  window,
  document,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  DOMParser: window.DOMParser,
});

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { resolvePasteAnchor, resolveFormatPasteStartRow } = await import(
  pathToFileURL(path.join(base, "dataCapturePasteApply.js")).href,
);

const cellA4 = document.getElementById("cellA4");
const cellC2 = document.getElementById("cellC2");

const a4 = resolvePasteAnchor(cellA4);
assert.equal(a4.startRow, 0, "A4 row");
assert.equal(a4.startCol, 3, "A4 col (0-based index 3)");

const c2 = resolvePasteAnchor(cellC2);
assert.equal(c2.startRow, 2, "C2 row");
assert.equal(c2.startCol, 1, "C2 col");

assert.equal(resolveFormatPasteStartRow(cellA4), 0, "Format start prefers A4 row");
assert.equal(resolveFormatPasteStartRow(cellC2), 2, "Format start prefers C2 row even if empty grid");
assert.equal(resolveFormatPasteStartRow(null), 0, "No anchor on empty → 0");

// TEXT plain must not hardcode startColOverride: 0 in source.
const fs = await import("node:fs");
const textPasteSrc = fs.readFileSync(path.join(base, "dataCaptureTextPaste.js"), "utf8");
assert.ok(
  !/handleTextPlainPaste[\s\S]*?startColOverride:\s*0/.test(textPasteSrc),
  "TEXT plain paste must not force startColOverride: 0",
);

const formatHandlerSrc = fs.readFileSync(path.join(base, "dataCaptureFormatPasteHandler.js"), "utf8");
assert.ok(
  !/hasExistingData\s*\?\s*resolveFormatPasteStartRow/.test(formatHandlerSrc),
  "Format must not force startRow=0 when empty",
);
assert.ok(
  /startColOverride:\s*resolvedStartCol/.test(formatHandlerSrc),
  "Dual-source must use resolvedStartCol",
);

const formatHtmlSrc = fs.readFileSync(path.join(base, "dataCaptureFormatHtmlPaste.js"), "utf8");
assert.ok(
  /startColOverride:\s*startCol/.test(formatHtmlSrc),
  "HTML fill must use startCol option",
);

console.log("repro-paste-anchor-start: OK");

/**
 * Badge / chip "Total win: 2,753.79" → ["Total win:", "2,753.79"] (keep colon on label).
 * Run: node ./scripts/repro-label-colon-money-split.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix, trySplitLabelColonMoneyCell } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

assert.deepEqual(trySplitLabelColonMoneyCell("Total win: 2,753.79"), [
  "Total win:",
  "2,753.79",
]);
assert.deepEqual(trySplitLabelColonMoneyCell("TOTAL WIN: 2,753.79"), [
  "TOTAL WIN:",
  "2,753.79",
]);
assert.equal(trySplitLabelColonMoneyCell("12:30"), null);
assert.equal(trySplitLabelColonMoneyCell("http://example.com"), null);

const matrix = parsePlainTextMatrix("Total win: 2,753.79");
assert.equal(matrix.length, 1);
assert.equal(matrix[0].length, 2);
assert.equal(matrix[0][0], "Total win:");
assert.equal(matrix[0][1], "2,753.79");

const multi = parsePlainTextMatrix("Total win: 1.00\nTotal bet: 2,500.50");
assert.equal(multi.length, 2);
assert.equal(multi[0][0], "Total win:");
assert.equal(multi[0][1], "1.00");
assert.equal(multi[1][0], "Total bet:");
assert.equal(multi[1][1], "2,500.50");

// Already tab-split rows must stay untouched.
const tabbed = parsePlainTextMatrix("Total win\t2,753.79");
assert.deepEqual(tabbed, [["Total win", "2,753.79"]]);

console.log("repro-label-colon-money-split: OK");

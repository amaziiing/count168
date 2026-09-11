/**
 * Repro + verify: user copies the AWC API report from Excel
 * (Report_1788764040619.xlsx) and pastes into Data Capture. The clipboard
 * carries an HTML <table> (Excel flavor) + text/plain TSV.
 *
 * Bug (fixed in vendors/dataCaptureAwcPaste.js): the AWC helper's HTML branch
 * flattened the 26-col grid into a token stream and re-grouped it with the AWC
 * portal's vertical-dump rules (parseAWCPatternBasedData), dropping the 9 rows
 * whose row-start marker is not a lowercase user id ("717a" starts with a
 * digit, "KZ999" with an uppercase letter) and the 2 columns that sit before
 * the first recognized marker (Currency, User ID) — 14 data rows became 5.
 *
 * Fix: a rectangular single-table clipboard is built row-by-row
 * (buildAwcWinLossMatrixFromCellRows); the portal's ragged el-table markup
 * still goes through the token path.
 *
 * Run: node scripts/repro-awc-excel-truncation.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

import {
  looksLikeAwcWinLossReportTokens,
  parseAWCPatternBasedData,
  buildAwcWinLossMatrixFromCellRows,
} from "../src/pages/datacapture/paste/vendors/dataCaptureAwcPaste.js";

const here = dirname(fileURLToPath(import.meta.url));
const tsvPath = join(here, "fixtures", "awc-report.tsv");
const tsv = readFileSync(tsvPath, "utf8").replace(/\r\n/g, "\n");
const rows = tsv.split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
console.log(`source: ${rows.length} lines x ${rows[0].length} cols`);

// --- text/plain path (TSV lines are whole rows): helper must decline ---
const plainLines = tsv.split("\n").map((l) => l.trim()).filter((l) => l !== "");
console.log("\n[1.TEXT text/plain branch]");
assert.equal(looksLikeAwcWinLossReportTokens(plainLines), false, "plain TSV lines must not look like the portal vertical dump");
console.log("  looksLikeAwcWinLossReportTokens(plain lines) = false -> helper declines (unchanged)");

// --- old HTML behavior: flatten + regroup reproduced the 5-row truncation ---
const tokens = rows.flat().filter((cell) => cell.trim() !== "");
console.log("\n[HTML branch — Excel <table>]");
assert.equal(looksLikeAwcWinLossReportTokens(tokens), true, "gate claims the Excel copy (unchanged by the fix)");
console.log("  gate claims the clipboard (looksLike = true) -> matrix build decides the outcome");

const legacyMatrix = parseAWCPatternBasedData(tokens);
console.log(`  OLD token path (portal vertical-dump rules): ${legacyMatrix.length} rows, cols start at "${legacyMatrix[0]?.[0]}"`);
assert.equal(legacyMatrix.length, 5, "documents the reported bug: 14 data rows collapsed to 5");

// --- fixed HTML behavior: rectangular grid built row-by-row ---
const cellRows = rows.map((cells) => cells.map((text) => ({ text: text.trim(), colspan: 1 })));
const matrix = buildAwcWinLossMatrixFromCellRows(cellRows);
assert.ok(matrix, "rectangular grid must build a matrix");
assert.equal(matrix.length, rows.length, "every row survives (header + 14 data rows)");
assert.equal(matrix[0][0], "Currency", "first row is the pasted header, verbatim");
assert.deepEqual(
  matrix.map((row) => row[2]),
  rows.map((r) => r[2]),
  "User Name column drives row order — 717a / KZ999 rows all present",
);
matrix.forEach((row) => assert.equal(row.length, rows[0].length, "26 columns preserved on every row"));
console.log(`  NEW rectangular path: ${matrix.length} rows x ${matrix[0].length} cols — nothing dropped`);
const spot = matrix.find((row) => row[2] === "717a");
assert.deepEqual(spot.slice(0, 8), ["MYR", "gams(SV)MYR", "717a", "SV388", "LIVE", "13692", "172564.95", "178951.95"]);
console.log("  spot-check 717a row verbatim:", spot.slice(0, 8).join(" | "));

// --- ragged portal markup (first row missing the checkbox <td>) still ->
//     token path: buildAwcWinLossMatrixFromCellRows must reject it ---
const portalCellRows = [
  rows[1].map((text) => ({ text, colspan: 1 })), // drag-select start row: no checkbox td
  ["", ...rows[2]].map((text) => ({ text, colspan: 1 })), // fully-contained rows carry it
  ["", ...rows[3]].map((text) => ({ text, colspan: 1 })),
];
assert.equal(buildAwcWinLossMatrixFromCellRows(portalCellRows), null, "ragged portal markup is not rectangular");
console.log("\n  ragged el-table selection rejected -> still served by the portal token path (unchanged)");
console.log("\nALL CHECKS PASSED");

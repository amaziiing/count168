import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeAwcWinLossReportTokens,
  buildAwcWinLossMatrixFromCellRows,
} from "./dataCaptureAwcPaste.js";

const cells = (values) => values.map((text) => ({ text, colspan: 1 }));

// Real header + representative data rows of the AWC API report xlsx
// (Report_1788764040619.xlsx): user ids that are lowercase ("allbet95"),
// digit-leading ("717a") and uppercase-leading ("KZ999").
const HEADER = [
  "Currency", "User ID", "User Name", "Platform", "Game Type", "Bet Count",
  "Valid Turnover", "Bet Amount", "Total Bet", "Jackpot Contribution",
  "Jackpot Win", "Player Win/Loss", "Player Adjustment", "Player Total P/L",
  "Player Margin(%)", "Agent Win/Loss", "Agent Adjustment", "Agent Total P/L",
  "MasterAgent Win/Loss", "MasterAgent Adjustment", "MasterAgent Total P/L",
  "Manager Win/Loss", "Manager Adjustment", "Manager Total P/L",
  "Company Total P/L", "Remark",
];
const ROW_ALLBET = [
  "MYR", "allbet95ms(SV)MYR", "allbet95", "SV388", "LIVE", "15", "343.50",
  "329.60", "345.00", "-", "0.00", "124.90", "0.00", "124.90", "36.36",
  "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00",
  "-124.90", "",
];
const ROW_717A = [
  "MYR", "gams(SV)MYR", "717a", "SV388", "LIVE", "13692", "172564.95",
  "178951.95", "184268.00", "-", "0.00", "-6349.88", "0.00", "-6349.88",
  "-3.68", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00",
  "0.00", "6349.88", "",
];
const ROW_KZ999 = [
  "MYR", "kzawcms(KM)MYR", "KZ999", "KINGMIDAS", "TABLE", "36", "44.00",
  "44.00", "44.00", "-", "0.00", "-16.90", "0.00", "-16.90", "-38.41",
  "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00",
  "16.90", "",
];

test("Excel rectangular copy builds row-by-row: every row and column survive", () => {
  const matrix = buildAwcWinLossMatrixFromCellRows([
    cells(HEADER),
    cells(ROW_ALLBET),
    cells(ROW_717A),
    cells(ROW_KZ999),
  ]);
  assert.ok(matrix);
  assert.equal(matrix.length, 4, "header + all data rows, including 717a and KZ999");
  assert.deepEqual(matrix[0], HEADER);
  assert.deepEqual(matrix[2], ROW_717A, "digit-leading user id row is not glued into the previous row");
  assert.deepEqual(matrix[3], ROW_KZ999, "uppercase user id row is not glued into the previous row");
  matrix.forEach((row) => assert.equal(row.length, HEADER.length));
});

test("Chrome-style rectangular clipboard keeps empty cells so columns stay aligned", () => {
  const matrix = buildAwcWinLossMatrixFromCellRows([
    cells(["Currency", "User ID", "User Name", "Platform", "Game Type", "Bet Count", "Bet Amount", "Company Total P/L", "Remark"]),
    cells(["MYR", "allbet95ms(SV)MYR", "allbet95", "SV388", "LIVE", "15", "329.60", "-124.90", ""]),
    cells(["MYR", "gams(SV)MYR", "717a", "SV388", "LIVE", "13692", "178951.95", "6349.88", ""]),
  ]);
  assert.ok(matrix);
  assert.deepEqual(
    matrix.map((row) => row.at(-1)),
    ["Remark", "", ""],
    "trailing empty Remark column is preserved, not collapsed",
  );
});

test("ragged portal markup (checkbox td missing on the selection-start row) is not rectangular", () => {
  assert.equal(
    buildAwcWinLossMatrixFromCellRows([
      cells(ROW_ALLBET.slice(1)),
      cells(["", ...ROW_ALLBET]),
      cells(["", ...ROW_717A]),
    ]),
    null,
    "must fall through to the portal token path, not build a shifted grid",
  );
});

test("single-row or sub-3-column tables are not claimed as rectangular grids", () => {
  assert.equal(buildAwcWinLossMatrixFromCellRows([cells(ROW_ALLBET)]), null, "one row only");
  assert.equal(
    buildAwcWinLossMatrixFromCellRows([cells(["a", "b"]), cells(["c", "d"])]),
    null,
    "two columns only",
  );
});

test("leading all-empty column (row-selection checkbox) is stripped, data columns kept", () => {
  const matrix = buildAwcWinLossMatrixFromCellRows([
    cells(["", ...HEADER.slice(0, 8)]),
    cells(["", ...ROW_ALLBET.slice(0, 8)]),
    cells(["", ...ROW_717A.slice(0, 8)]),
  ]);
  assert.ok(matrix);
  assert.deepEqual(matrix.map((row) => row[0]), ["Currency", "MYR", "MYR"]);
  matrix.forEach((row) => assert.equal(row.length, 8));
});

test("detection gate: the Excel copy is claimed, plain foreign text is not", () => {
  const excelTokens = [HEADER, ROW_ALLBET, ROW_717A].flat().filter((t) => t !== "");
  assert.equal(looksLikeAwcWinLossReportTokens(excelTokens), true);

  assert.equal(looksLikeAwcWinLossReportTokens(["hello", "world", "foo", "bar", "baz", "qux"]), false);
  assert.equal(looksLikeAwcWinLossReportTokens([]), false);
});

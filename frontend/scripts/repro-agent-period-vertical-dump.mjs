/**
 * Fixture: agent_period report copied as one-field-per-line (no tabs).
 * Expect detectVerticalFieldDump → 3×9, not N×1.
 */
import { detectVerticalFieldDump } from "../src/pages/datacapture/paste/core/dataCaptureVerticalDumpDetect.js";
import { parsePlainTextMatrix } from "../src/pages/datacapture/paste/core/dataCaptureTextPaste.js";

const lines = [
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
];

const detected = detectVerticalFieldDump(lines);
const matrix = parsePlainTextMatrix(lines.join("\n"));

const ok =
  detected?.width === 9 &&
  detected?.rows?.length === 3 &&
  detected.rows[0]?.[0] === "SDSPDA95" &&
  detected.rows[0]?.[8] === "$1,584.95" &&
  detected.rows[1]?.[0] === "Subtotal" &&
  matrix.length === 3 &&
  matrix[0].length === 9;

console.log(
  JSON.stringify(
    {
      ok,
      width: detected?.width ?? null,
      detectRows: detected?.rows?.length ?? null,
      detectCols: detected?.rows?.[0]?.length ?? null,
      parseRows: matrix.length,
      parseCols: matrix[0]?.length ?? 0,
      row0: detected?.rows?.[0] ?? matrix[0],
      row1: detected?.rows?.[1] ?? matrix[1],
    },
    null,
    2,
  ),
);

if (!ok) process.exit(1);

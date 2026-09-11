/**
 * 1.TEXT: vertical field dump must reshape to 9-col rows (not N×1 in col A).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { detectVerticalFieldDump } = await import(
  pathToFileURL(path.join(base, "dataCaptureVerticalDumpDetect.js")).href,
);
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);

const vals = [
  "SDSPDA95",
  "7,182",
  "$0.00",
  "$12,390.95",
  "$12,390.95",
  "$10,806.00",
  "$12,390.95",
  "$0.00",
  "$1,584.95",
];
const lines = [
  ...vals,
  "SUBTOTAL",
  ...vals.slice(1),
  "TOTAL AMOUNT",
  ...vals.slice(1),
];

const dump = detectVerticalFieldDump(lines);
const matrix = parsePlainTextMatrix(lines.join("\n"));

const checks = {
  dump3: dump?.length === 3,
  dumpAgent: dump?.[0]?.[0] === "SDSPDA95",
  dumpBet: dump?.[0]?.[1] === "7,182",
  dumpCols9: (dump?.[0]?.length || 0) >= 9,
  matrix3: matrix?.length === 3,
  matrixAgent: matrix?.[0]?.[0] === "SDSPDA95",
  matrixBet: matrix?.[0]?.[1] === "7,182",
  matrixCols9: (matrix?.[0]?.length || 0) >= 9,
};

const ok = Object.values(checks).every(Boolean);
console.log(
  JSON.stringify(
    {
      ok,
      checks,
      dump0: dump?.[0],
      matrix0: matrix?.[0],
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
console.log("PASS 1.TEXT vertical reshape");

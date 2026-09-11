/**
 * Fixture gate for Data Capture external-report paste (Grill: equal-citizen sources).
 * Run: node ./scripts/repro-datacapture-paste-gate.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPTS = [
  // A — DataTables / Excel / Total over-select
  "repro-overselect-paste.mjs",
  "repro-mario-tsv.mjs",
  // B — Material mat-row
  "repro-mat-paste-matrix.mjs",
  "repro-native-mat-row-paste.mjs",
  "repro-mat-clipboard-normalize.mjs",
  // C — Statement / screenshot
  "repro-statement-plain-matrix.mjs",
  "repro-user-screenshot-paste.mjs",
];

let failed = 0;
for (const name of SCRIPTS) {
  const scriptPath = path.join(__dirname, name);
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL gate: ${name} exit=${result.status}`);
  } else {
    console.log(`PASS gate: ${name}`);
  }
}

if (failed) {
  console.error(`\nPaste fixture gate: ${failed}/${SCRIPTS.length} failed`);
  process.exit(1);
}
console.log(`\nPaste fixture gate: all ${SCRIPTS.length} green`);

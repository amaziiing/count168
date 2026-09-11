/**
 * Playwright browser check for Material plain-newline paste reshape.
 *
 * Prereq: `npm run dev` (http://localhost:5173)
 * Run:    node ./scripts/playwright-plain-paste.mjs
 * Visible: node ./scripts/playwright-plain-paste.mjs --headed
 * Or:     $env:HEADED=1; node ./scripts/playwright-plain-paste.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PASTE_HARNESS_URL || "http://localhost:5173/paste-harness.html";
const SCREENSHOT = path.join(__dirname, "..", "paste-harness-result.png");

const report3RowsPlain = `SDSPDA95
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

const report4RowsPlain = `SDSPDA95
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
SDSPDA95B
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Subtotal
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44
Total Amount
6,522
$0.00
$11,110.75
$11,110.75
$9,825.31
$11,110.75
$0.00
$1,285.44`;

const CASES = [
  {
    name: "report-copy-1-row",
    plain: report4RowsPlain.split("\n").slice(0, 9).join("\n"),
    expect: (r) => r.matrixRows === 1 && r.matrixCols === 9,
  },
  {
    name: "report-copy-2-rows",
    plain: report4RowsPlain.split("\n").slice(0, 18).join("\n"),
    expect: (r) => r.matrixRows === 2 && r.matrixCols === 9,
  },
  {
    name: "report-copy-3-rows",
    plain: report3RowsPlain,
    expect: (r) => r.matrixRows === 3 && r.matrixCols === 9,
  },
  {
    name: "report-copy-4-rows",
    plain: report4RowsPlain,
    expect: (r) => r.matrixRows === 4 && r.matrixCols === 9 && r.matrix[1]?.[0] === "SDSPDA95B",
  },
  {
    name: "all-numeric-stays-vertical",
    plain: ["100", "200", "300", "$4.00", "5,000", "6.5", "7", "8", "9"].join("\n"),
    expect: (r) => r.matrixRows === 9 && r.matrixCols === 1,
  },
];

const headed = process.env.HEADED === "1" || process.argv.includes("--headed");
const holdMs = Number(process.env.HOLD_MS || (headed ? 20000 : 0));

const browser = await chromium.launch({
  headless: !headed,
  slowMo: headed ? 400 : 0,
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__pasteHarnessReady === true);

if (headed) {
  console.log(`\nBrowser open: ${BASE}`);
  console.log("Running visible demo on the page…\n");
  const demo = await page.evaluate(async () => window.__runVisibleDemo());
  console.log("visible demo:", demo);
}

let failed = 0;
for (const testCase of CASES) {
  const result = await page.evaluate((plain) => window.__runPlainPasteTest(plain), testCase.plain);
  const pass = testCase.expect(result);
  console.log(
    `${pass ? "PASS" : "FAIL"} ${testCase.name}: ${result.matrixRows}x${result.matrixCols}`,
  );
  if (!pass) {
    failed += 1;
    console.log("  matrix:", result.matrix);
  }
}

// 3× mat-row HTML (NO <table>) — mirrors report DevTools
const matHtml = `
<html><body><!--StartFragment-->
<mat-row class="mat-row ng-star-inserted" role="row">
  <mat-cell class="mat-cell cdk-column-agent_account" role="gridcell">SDSPDA95</mat-cell>
  <mat-cell class="mat-cell cdk-column-bet_count" role="gridcell">6,522</mat-cell>
  <mat-cell class="mat-cell cdk-column-event_amount" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell cdk-column-bet_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-real_bet_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-payout_amount" role="gridcell">$9,825.31</mat-cell>
  <mat-cell class="mat-cell cdk-column-valid_amount" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell cdk-column-fee_amount" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell positive" role="gridcell">$1,285.44</mat-cell>
</mat-row>
<mat-row class="mat-row ng-star-inserted" role="row">
  <mat-cell class="mat-cell" role="gridcell">Subtotal</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">6,522</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$9,825.31</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$1,285.44</mat-cell>
</mat-row>
<mat-row class="mat-row ng-star-inserted" role="row">
  <mat-cell class="mat-cell" role="gridcell">Total Amount</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">6,522</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$9,825.31</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$11,110.75</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$0.00</mat-cell>
  <mat-cell class="mat-cell" role="gridcell">$1,285.44</mat-cell>
</mat-row>
<!--EndFragment--></body></html>`;

const matResult = await page.evaluate((html) => window.__runMatHtmlPasteTest(html), matHtml);
const matPass =
  matResult.ok &&
  !matResult.sourceHasTable &&
  matResult.looksLikeGrid &&
  matResult.normalizedHasTable &&
  matResult.matrixRows === 3 &&
  matResult.matrixCols === 9;
console.log(
  `${matPass ? "PASS" : "FAIL"} native-mat-row-html-3x9-no-table: ${matResult.matrixRows}x${matResult.matrixCols}`,
  {
    sourceHasTable: matResult.sourceHasTable,
    looksLikeGrid: matResult.looksLikeGrid,
    normalizedHasTable: matResult.normalizedHasTable,
  },
);
if (!matPass) {
  failed += 1;
  console.log("  matResult:", matResult);
} else {
  matResult.matrix.forEach((row, i) => console.log(`  row${i}:`, row.join(" | ")));
}

await page.screenshot({ path: SCREENSHOT });
if (holdMs > 0) {
  console.log(`\nHolding browser open ${holdMs}ms so you can look at the page…`);
  try {
    await page.waitForTimeout(holdMs);
  } catch {
    console.log("(browser closed early — ok)");
  }
}
try {
  await browser.close();
} catch {
  /* already closed */
}
console.log(`screenshot: ${SCREENSHOT}`);

if (failed) {
  console.error(`\n${failed} Playwright case(s) failed`);
  process.exit(1);
}
console.log("\nAll Playwright paste cases green");

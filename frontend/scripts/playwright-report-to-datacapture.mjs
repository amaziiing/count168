/**
 * E2E: copy mat-row data from agsgd report → paste into count168.site Data Capture.
 *
 * Prereq (manual): log in to BOTH sites in the headed browser when prompted.
 *
 * Run:
 *   npx playwright install chromium
 *   node ./scripts/playwright-report-to-datacapture.mjs --headed
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_URL = process.env.REPORT_URL || "https://agsgd.ds922.fun/report/agent_period";
const DC_URL =
  process.env.DC_URL || "https://count168.site/datacapture/b98093de-5939-4b90-befd-c47715b399d0";
const headed = process.argv.includes("--headed");
const PAUSE_MS = Number(process.env.PAUSE_MS || (headed ? 120000 : 0));

/** Mimic Chrome text/plain when user selects N mat-rows (one field per line). */
function matRowsToPlain(rows) {
  const lines = [];
  rows.forEach((cells) => cells.forEach((cell) => lines.push(cell)));
  return lines.join("\n");
}

async function extractDataRows(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("mat-row")).filter((r) => {
      const cells = r.querySelectorAll("mat-cell");
      return cells.length >= 3;
    });
    return rows.map((r) =>
      Array.from(r.querySelectorAll("mat-cell")).map((c) => (c.textContent || "").trim()),
    );
  });
}

async function pastePlainToDataCapture(page, plain, startRow = 0) {
  await page.evaluate(
    ({ text, rowIndex }) => {
      document.querySelectorAll("#tableBody td[contenteditable='true']").forEach((td) => {
        td.textContent = "";
      });
      const rows = Array.from(document.querySelectorAll("#tableBody tr"));
      const tr = rows[rowIndex];
      const cell = tr?.querySelector("td[contenteditable='true']");
      if (!cell) throw new Error("no editable cell");
      cell.focus();
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      cell.dispatchEvent(evt);
      document.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    },
    { text: plain, rowIndex: startRow },
  );
  await page.waitForTimeout(800);
}

async function readGridRows(page, count = 3) {
  return page.evaluate((n) => {
    return Array.from(document.querySelectorAll("#tableBody tr"))
      .slice(0, n)
      .map((tr) =>
        Array.from(tr.querySelectorAll("td[contenteditable='true']"))
          .slice(0, 12)
          .map((td) => (td.textContent || "").trim()),
      );
  }, count);
}

function assertShape(grid, expectedRows, expectedCols) {
  for (let r = 0; r < expectedRows; r += 1) {
    const filled = (grid[r] || []).filter(Boolean).length;
    if (filled < expectedCols) {
      throw new Error(`row${r} filled=${filled}, expected >= ${expectedCols}`);
    }
  }
  const col0Stacked = (grid[0] || []).filter(Boolean).length === 1 && expectedRows > 1;
  if (col0Stacked) throw new Error("vertical dump detected (failure mode)");
}

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 300 : 0 });
const context = await browser.newContext();
const reportPage = await context.newPage();
const dcPage = await context.newPage();

await reportPage.goto(REPORT_URL, { waitUntil: "networkidle" });
await dcPage.goto(DC_URL, { waitUntil: "networkidle" });

console.log("\n=== Manual step ===");
console.log("1) In the REPORT tab: log in + open agent_period until mat-row table shows");
console.log("2) In the COUNT168 tab: ensure Data Capture is open (1.TEXT)");
console.log(`Waiting ${PAUSE_MS / 1000}s…\n`);
if (PAUSE_MS > 0) await reportPage.waitForTimeout(PAUSE_MS);

const allRows = await extractDataRows(reportPage);
if (allRows.length < 3) {
  console.error(`Need >= 3 data mat-rows on report page, found ${allRows.length}`);
  console.error("URL:", reportPage.url());
  await browser.close();
  process.exit(1);
}

const tests = [
  { name: "copy-1-row", count: 1 },
  { name: "copy-2-rows", count: 2 },
  { name: "copy-3-rows", count: 3 },
];

let failed = 0;
for (const test of tests) {
  const slice = allRows.slice(0, test.count);
  const plain = matRowsToPlain(slice);
  const expectedCols = slice[0]?.length || 0;

  await dcPage.bringToFront();
  await pastePlainToDataCapture(dcPage, plain, 0);
  const grid = await readGridRows(dcPage, test.count);

  try {
    assertShape(grid, test.count, Math.min(expectedCols, 8));
    console.log(`PASS ${test.name}: ${test.count}x${expectedCols}`);
    grid.slice(0, test.count).forEach((row, i) => console.log(`  row${i}:`, row.filter(Boolean).slice(0, 5).join(" | ")));
  } catch (err) {
    failed += 1;
    console.log(`FAIL ${test.name}:`, err.message);
    console.log("  grid:", grid);
  }
}

await dcPage.screenshot({
  path: path.join(__dirname, "..", "report-to-datacapture-result.png"),
});
await browser.close();

if (failed) process.exit(1);
console.log("\nAll report → datacapture paste tests green");

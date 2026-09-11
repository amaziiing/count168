/**
 * Bank Process Date Range visual + functional smoke (Vite on :5173).
 * node scripts/repro-bank-daterange.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_TRIGGER = path.resolve(__dirname, "../../verify-bank-daterange-fixed.png");
const OUT_POPUP = path.resolve(__dirname, "../../verify-bank-daterange-popup.png");
const BASE = process.env.VITE_BASE || "http://127.0.0.1:5173";
const FIXTURE_DIR = path.resolve(__dirname, "../public/dev-fixtures");
const FIXTURE_FILE = path.join(FIXTURE_DIR, "bank-daterange.html");
const FIXTURE_URL = `${BASE}/dev-fixtures/bank-daterange.html`;

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["thisWeek", "This Week"],
  ["lastWeek", "Last Week"],
  ["thisMonth", "This Month"],
  ["lastMonth", "Last Month"],
  ["thisYear", "This Year"],
  ["lastYear", "Last Year"],
];

const presetButtons = PRESETS.map(
  ([key, label]) =>
    `<button type="button" class="transaction-calendar-preset" data-period-key="${key}">${label}</button>`,
).join("\n      ");

const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bank DateRange Fixture</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
  <link rel="stylesheet" href="/css/date-range-picker.css" />
  <link rel="stylesheet" href="/css/processCSS.css" />
  <link rel="stylesheet" href="/css/processlist.css" />
</head>
<body class="process-page process-page--bank">
  <div class="action-controls-row bank-process-toolbar-primary" style="display:flex;align-items:center;gap:12px;padding:24px;background:#f8fafc">
    <div class="process-list-date-filter transaction-date-range-group" id="processListDateFilter" style="display:inline-flex">
      <div class="date-range-picker" id="date-range-picker" role="button" tabindex="0">
        <i class="fas fa-calendar-alt" aria-hidden="true"></i>
        <span id="date-range-display"></span>
        <button type="button" class="process-list-date-clear" id="processListDateClearBtn">&times;</button>
        <i class="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true"></i>
      </div>
      <input type="hidden" id="date_from" value="" />
      <input type="hidden" id="date_to" value="" />
    </div>
  </div>
  <div class="calendar-popup calendar-popup--transaction-range calendar-popup--bank-process-modal" id="calendar-popup" style="display:none">
    <div class="transaction-calendar-presets">
      ${presetButtons}
    </div>
    <div class="transaction-calendar-panel">
      <div class="calendar-header">
        <button type="button" class="calendar-nav-btn"><i class="fas fa-chevron-left"></i></button>
        <div class="calendar-month-year">
          <button type="button" id="calendar-month-select" class="calendar-month-trigger">Jul</button>
          <button type="button" id="calendar-year-select" class="calendar-year-trigger">2026</button>
        </div>
        <button type="button" class="calendar-nav-btn"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="calendar-weekdays"></div>
      <div class="calendar-days" id="calendar-days"></div>
    </div>
  </div>
  <script type="module">
    import { ensureMaintenanceDateRangePicker } from "/src/utils/date/dateRangePicker.js";
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker.init({
      allowEmpty: true,
      preserveDisplayUntilCommit: true,
      placeholder: "Select date range",
      selectEndDateHint: "Select end date",
      clearDateLabel: "Clear",
      onChange: () => { window.__lastChange = Date.now(); },
    });
    window.__drpReady = true;
  </script>
</body>
</html>`;

fs.mkdirSync(FIXTURE_DIR, { recursive: true });
fs.writeFileSync(FIXTURE_FILE, fixtureHtml, "utf8");

let exitCode = 0;
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(FIXTURE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__drpReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(200);

  const triggerStyles = await page.evaluate(() => {
    const pick = document.querySelector("#date-range-picker");
    const icon = pick.querySelector("i.fa-calendar-alt");
    const display = pick.querySelector("#date-range-display");
    const cs = getComputedStyle(pick);
    const ic = getComputedStyle(icon);
    const ds = getComputedStyle(display);
    const pr = pick.getBoundingClientRect();
    const ir = icon.getBoundingClientRect();
    return {
      border: cs.border,
      gap: cs.gap,
      overflow: cs.overflow,
      iconBg: ic.backgroundColor,
      iconRadius: ic.borderRadius,
      displayPadLeft: ds.paddingLeft,
      flush: {
        top: Math.abs(ir.top - pr.top),
        bottom: Math.abs(ir.bottom - pr.bottom),
        left: Math.abs(ir.left - pr.left),
      },
    };
  });

  await page.locator("#date-range-picker").screenshot({ path: OUT_TRIGGER });

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(250);

  const triggerWhileOpen = await page.evaluate(() => {
    const pick = document.querySelector("#date-range-picker");
    const icon = pick.querySelector("i.fa-calendar-alt");
    const cs = getComputedStyle(pick);
    const ic = getComputedStyle(icon);
    const pr = pick.getBoundingClientRect();
    const ir = icon.getBoundingClientRect();
    return {
      border: cs.border,
      gap: cs.gap,
      overflow: cs.overflow,
      iconBg: ic.backgroundColor,
      iconRadius: ic.borderRadius,
      flush: {
        top: Math.abs(ir.top - pr.top),
        bottom: Math.abs(ir.bottom - pr.bottom),
        left: Math.abs(ir.left - pr.left),
      },
    };
  });

  await page.locator("#date-range-picker").screenshot({
    path: path.resolve(__dirname, "../../verify-bank-daterange-open-trigger.png"),
  });

  const popupOpen = await page.evaluate(() => {
    const popup = document.getElementById("calendar-popup");
    const cs = getComputedStyle(popup);
    const presets = popup.querySelector(".transaction-calendar-presets");
    const presetCs = getComputedStyle(presets);
    const pr = popup.getBoundingClientRect();
    return {
      display: cs.display,
      gridCols: cs.gridTemplateColumns,
      width: pr.width,
      hasNoPresets: popup.classList.contains("calendar-popup--no-presets"),
      hasMatchAnchor: popup.classList.contains("calendar-popup--match-anchor"),
      presetDisplay: presetCs.display,
      presetCount: popup.querySelectorAll(".transaction-calendar-preset").length,
      dayCount: document.querySelectorAll("#calendar-days .calendar-day").length,
      headerMaxWidth: getComputedStyle(popup.querySelector(".calendar-header")).maxWidth,
    };
  });

  await page.locator("#calendar-popup").screenshot({ path: OUT_POPUP });

  await page.locator('.transaction-calendar-preset[data-period-key="today"]').click();
  await page.waitForTimeout(200);
  const afterToday = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
    popupClosed: getComputedStyle(document.getElementById("calendar-popup")).display === "none",
  }));

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(150);
  await page.locator('.transaction-calendar-preset[data-period-key="thisWeek"]').click();
  await page.waitForTimeout(200);
  const afterWeek = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
  }));

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(150);
  const days = page.locator("#calendar-days .calendar-day:not(.disabled)");
  await days.nth(2).click();
  await page.waitForTimeout(80);
  await days.nth(5).click();
  await page.waitForTimeout(200);
  const afterRange = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
  }));

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(150);
  await page.locator('.transaction-calendar-preset[data-period-key="thisYear"]').click();
  await page.waitForTimeout(200);
  const afterThisYear = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
    popupClosed: getComputedStyle(document.getElementById("calendar-popup")).display === "none",
  }));

  // Stale modal binding (modal closed, hidden inputs gone) should still commit toolbar range on first click.
  await page.evaluate(() => {
    window.MaintenanceDateRangePicker.getActiveRangeBinding = () => ({
      dateFromId: "bank_day_start_drp_from",
      dateToId: "bank_day_start_drp_to",
      displayId: "bank_day_start_drp_display",
    });
    document.getElementById("date_from").value = "";
    document.getElementById("date_to").value = "";
    document.getElementById("date-range-display").textContent = "Select date range";
  });
  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(150);
  await page.locator('.transaction-calendar-preset[data-period-key="thisYear"]').click();
  await page.waitForTimeout(200);
  const afterStaleBinding = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
  }));

  const pass = {
    triggerBorder: triggerStyles.border.includes("1px") && triggerStyles.border.includes("148, 163, 184"),
    triggerGapZero: triggerStyles.gap === "0px",
    triggerOverflowHidden: triggerStyles.overflow === "hidden",
    triggerIconBlue: triggerStyles.iconBg.includes("59, 130, 246"),
    triggerIconFlush: triggerStyles.flush.top <= 1.5 && triggerStyles.flush.bottom <= 1.5 && triggerStyles.flush.left <= 1.5,
    triggerTextPad: parseFloat(triggerStyles.displayPadLeft) >= 6,
    openTriggerBorder: triggerWhileOpen.border.includes("1px"),
    openTriggerGapZero: triggerWhileOpen.gap === "0px",
    openTriggerIconFlush: triggerWhileOpen.flush.top <= 1.5 && triggerWhileOpen.flush.bottom <= 1.5 && triggerWhileOpen.flush.left <= 1.5,
    popupGrid: popupOpen.display === "grid",
    popupWideEnough: popupOpen.width >= 300,
    popupHasPresets: popupOpen.presetCount === 8 && popupOpen.presetDisplay !== "none",
    popupNotNarrowMode: !popupOpen.hasNoPresets && !popupOpen.hasMatchAnchor,
    popupDaysRender: popupOpen.dayCount >= 28,
    popupHeaderCentered: popupOpen.headerMaxWidth !== "none" && parseFloat(popupOpen.headerMaxWidth) <= 260,
    todayWorks: !!(afterToday.from && afterToday.to && afterToday.popupClosed),
    weekWorks: !!(afterWeek.from && afterWeek.to && afterWeek.display.includes("-")),
    thisYearWorks: !!(afterThisYear.from && afterThisYear.to && afterThisYear.display.includes("-") && afterThisYear.popupClosed),
    staleBindingWorks: !!(afterStaleBinding.from && afterStaleBinding.to && afterStaleBinding.display.includes("-")),
    rangeWorks: !!(afterRange.from && afterRange.to && afterRange.from !== afterRange.to),
  };

  console.log(JSON.stringify({ triggerStyles, triggerWhileOpen, popupOpen, afterToday, afterWeek, afterThisYear, afterStaleBinding, afterRange, pass }, null, 2));
  const failed = Object.entries(pass).filter(([, v]) => !v).map(([k]) => k);
  await browser.close();
  if (failed.length) {
    console.error("FAIL:", failed.join(", "));
    exitCode = 1;
  } else {
    console.log("OK");
  }
} finally {
  try {
    fs.unlinkSync(FIXTURE_FILE);
  } catch {
    /* ignore */
  }
}

process.exit(exitCode);

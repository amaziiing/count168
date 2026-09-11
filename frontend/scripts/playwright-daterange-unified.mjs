/**
 * Unified Date Range picker parity test (Bank / Dashboard / Transaction fixtures).
 * Requires Vite dev server: npm run dev -- --host 127.0.0.1 --port 5173
 *
 * node scripts/playwright-daterange-unified.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.VITE_BASE || "http://127.0.0.1:5173";
const FIXTURE_DIR = path.resolve(__dirname, "../public/dev-fixtures");
const OUT_DIR = path.resolve(__dirname, "../../verify-daterange-unified");

const PRESET_KEYS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
];

const PRESET_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  thisYear: "This Year",
  lastYear: "Last Year",
};

const VARIANTS = [
  {
    id: "bank",
    title: "Bank Process List",
    bodyClass: "process-page process-page--bank",
    css: ["/css/date-range-picker.css", "/css/processCSS.css", "/css/processlist.css"],
    toolbarWrap: `
      <div class="action-controls-row bank-process-toolbar-primary" style="display:flex;align-items:center;padding:24px;background:#f8fafc">
        <div class="process-list-date-filter transaction-date-range-group" style="display:inline-flex">
          {{PICKER}}
          <input type="hidden" id="date_from" value="" />
          <input type="hidden" id="date_to" value="" />
        </div>
      </div>`,
    pickerHtml: `
      <div class="date-range-picker" id="date-range-picker"
        data-drp-from="date_from" data-drp-to="date_to" data-drp-display="date-range-display"
        role="button" tabindex="0">
        <i class="fas fa-calendar-alt" aria-hidden="true"></i>
        <span id="date-range-display" aria-live="polite"></span>
        <button type="button" class="process-list-date-clear" id="processListDateClearBtn">&times;</button>
        <i class="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true"></i>
      </div>`,
    initOptions: {
      allowEmpty: true,
      preserveDisplayUntilCommit: true,
      placeholder: "Select date range",
      selectEndDateHint: "Select end date",
      clearDateLabel: "Clear",
    },
    testStaleBinding: true,
    testTriggerCss: true,
  },
  {
    id: "dashboard",
    title: "Dashboard Home",
    bodyClass: "dashboard-page report-page",
    css: ["/css/date-range-picker.css", "/css/dashboard.css"],
    toolbarWrap: `
      <div class="dashboard-card dashboard-filter-panel" style="padding:24px;background:#f8fafc">
        <div class="dashboard-filter-date-row">
          <div class="dashboard-filter-date-field report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
            <div class="report-outlined-shell report-outlined-shell--no-label">
              <div class="report-outlined-inner">
                <div class="transaction-date-range-group">
                  {{PICKER}}
                  <input type="hidden" id="date_from" value="" />
                  <input type="hidden" id="date_to" value="" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
    pickerHtml: `
      <div class="date-range-picker" id="date-range-picker" role="button" tabindex="0">
        <i class="fas fa-calendar-alt"></i>
        <span id="date-range-display"></span>
        <i class="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true"></i>
      </div>`,
    initOptions: {
      allowEmpty: false,
      placeholder: "Select date range",
      selectEndDateHint: "Select end date",
    },
    testStaleBinding: false,
    testTriggerCss: false,
  },
  {
    id: "transaction",
    title: "Transaction Payment (Capture Date)",
    bodyClass: "transaction-page",
    css: ["/css/date-range-picker.css", "/css/transaction.css"],
    toolbarWrap: `
      <div class="transaction-search-toolbar" style="padding:24px;background:#f8fafc">
        <div class="report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
          <div class="report-outlined-shell">
            <span class="report-outlined-label">Capture Date</span>
            <div class="report-outlined-inner">
              <div class="transaction-date-range-group">
                {{PICKER}}
                <input type="hidden" id="date_from" value="" />
                <input type="hidden" id="date_to" value="" />
              </div>
            </div>
          </div>
        </div>
      </div>`,
    pickerHtml: `
      <div class="date-range-picker" id="date-range-picker" role="button" tabindex="0">
        <i class="fas fa-calendar-alt"></i>
        <span id="date-range-display" aria-live="polite"></span>
        <i class="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true"></i>
      </div>`,
    initOptions: {
      allowEmpty: true,
      placeholder: "Select date range",
      selectEndDateHint: "Select end date",
    },
    testStaleBinding: true,
    testTriggerCss: false,
  },
];

function presetButtonsHtml() {
  return PRESET_KEYS.map(
    (key) =>
      `<button type="button" class="transaction-calendar-preset" data-period-key="${key}">${PRESET_LABELS[key]}</button>`,
  ).join("\n      ");
}

function buildFixtureHtml(variant) {
  const cssLinks = variant.css.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n  ");
  const initJson = JSON.stringify(variant.initOptions);
  const toolbar = variant.toolbarWrap.replace("{{PICKER}}", variant.pickerHtml);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DateRange Unified — ${variant.title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
  ${cssLinks}
</head>
<body class="${variant.bodyClass}">
  ${toolbar}
  <div class="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style="display:none" aria-hidden="true">
    <div class="transaction-calendar-presets">${presetButtonsHtml()}</div>
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
    window.__onChangeCount = 0;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker.init({
      ...${initJson},
      onChange: () => { window.__onChangeCount += 1; window.__lastChange = Date.now(); },
    });
    window.__drpReady = true;
  </script>
</body>
</html>`;
}

async function clearDates(page) {
  await page.evaluate(() => {
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    const display = document.getElementById("date-range-display");
    if (df) df.value = "";
    if (dt) dt.value = "";
    if (display) display.textContent = "Select date range";
    window.__onChangeCount = 0;
    window.MaintenanceDateRangePicker?.clear?.();
  });
  await page.waitForTimeout(120);
}

async function readPickerState(page) {
  return page.evaluate(() => {
    const display = document.getElementById("date-range-display")?.textContent?.trim() || "";
    const from = document.getElementById("date_from")?.value?.trim() || "";
    const to = document.getElementById("date_to")?.value?.trim() || "";
    const popup = document.getElementById("calendar-popup");
    const popupCs = popup ? getComputedStyle(popup) : null;
    return {
      display,
      from,
      to,
      popupClosed: !popup || popupCs.display === "none",
      onChangeCount: window.__onChangeCount || 0,
    };
  });
}

async function openPicker(page) {
  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(180);
  return page.evaluate(() => {
    const popup = document.getElementById("calendar-popup");
    const cs = popup ? getComputedStyle(popup) : null;
    const presets = popup?.querySelector(".transaction-calendar-presets");
    return {
      open: popup && cs.display !== "none",
      presetCount: popup?.querySelectorAll(".transaction-calendar-preset").length || 0,
      gridDisplay: cs?.display || "",
      width: popup?.getBoundingClientRect().width || 0,
      dayCount: document.querySelectorAll("#calendar-days .calendar-day").length,
    };
  });
}

async function clickPreset(page, key) {
  await page.locator(`.transaction-calendar-preset[data-period-key="${key}"]`).click();
  await page.waitForTimeout(220);
}

function displayShowsRange(display, from, to) {
  if (!display || !from || !to) return false;
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const d = norm(display);
  if (from === to) return d.includes(from) || d === from;
  return d.includes(from) && d.includes(to);
}

async function testPresetSingleClick(page, key) {
  await clearDates(page);
  await openPicker(page);
  await clickPreset(page, key);
  const state = await readPickerState(page);
  return {
    key,
    ...state,
    singleClickOk: !!(state.from && state.to && state.popupClosed),
    displayOk: displayShowsRange(state.display, state.from, state.to),
    onChangeFired: state.onChangeCount > 0,
  };
}

async function testThisYearFromEmpty(page) {
  await clearDates(page);
  const empty = await readPickerState(page);
  await openPicker(page);
  await clickPreset(page, "thisYear");
  const after = await readPickerState(page);
  return {
    emptyBefore: !empty.from && !empty.to,
    singleClickOk: !!(after.from && after.to && after.popupClosed),
    displayOk: displayShowsRange(after.display, after.from, after.to),
    from: after.from,
    to: after.to,
    display: after.display,
  };
}

async function testStaleBinding(page) {
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
  await openPicker(page);
  await clickPreset(page, "thisYear");
  const after = await readPickerState(page);
  return {
    singleClickOk: !!(after.from && after.to && after.popupClosed),
    displayOk: displayShowsRange(after.display, after.from, after.to),
    from: after.from,
    to: after.to,
  };
}

async function testThisYearReopenHighlight(page) {
  await clearDates(page);
  await openPicker(page);
  await clickPreset(page, "thisYear");
  const afterFirst = await readPickerState(page);

  // Simulate legacy React layout sync that wrote DD-MM-YYYY into hidden inputs.
  await page.evaluate(() => {
    document.getElementById("date_from").value = "01-01-2026";
    document.getElementById("date_to").value = "15-07-2026";
  });

  await openPicker(page);
  const onReopen = await page.evaluate(() => {
    const btn = document.querySelector('.transaction-calendar-preset[data-period-key="thisYear"]');
    return {
      presetActive: btn?.classList.contains("is-active") === true,
      ariaPressed: btn?.getAttribute("aria-pressed") === "true",
    };
  });

  return {
    firstClickDisplay: afterFirst.display,
    displayUsesSlashes: /\d{2}\/\d{2}\/\d{4}/.test(afterFirst.display),
    displayNotDashFormat: !/\d{2}-\d{2}-\d{4}/.test(afterFirst.display),
    presetActiveOnReopen: onReopen.presetActive && onReopen.ariaPressed,
  };
}

async function testManualRange(page) {
  await clearDates(page);
  await openPicker(page);
  const days = page.locator("#calendar-days .calendar-day:not(.disabled)");
  await days.nth(2).click();
  await page.waitForTimeout(80);
  await days.nth(5).click();
  await page.waitForTimeout(220);
  const state = await readPickerState(page);
  return {
    singleClickOk: !!(state.from && state.to && state.from !== state.to && state.popupClosed),
    displayOk: displayShowsRange(state.display, state.from, state.to),
    from: state.from,
    to: state.to,
  };
}

async function testTriggerCss(page) {
  return page.evaluate(() => {
    const pick = document.querySelector("#date-range-picker");
    const icon = pick?.querySelector("i.fa-calendar-alt");
    if (!pick || !icon) return { ok: false };
    const cs = getComputedStyle(pick);
    const ic = getComputedStyle(icon);
    const pr = pick.getBoundingClientRect();
    const ir = icon.getBoundingClientRect();
    return {
      ok: true,
      gap: cs.gap,
      overflow: cs.overflow,
      border: cs.border,
      iconBlue: ic.backgroundColor.includes("59, 130, 246"),
      flushLeft: Math.abs(ir.left - pr.left) <= 1.5,
      flushTop: Math.abs(ir.top - pr.top) <= 1.5,
    };
  });
}

async function runVariant(browser, variant) {
  const fixtureFile = path.join(FIXTURE_DIR, `daterange-unified-${variant.id}.html`);
  const fixtureUrl = `${BASE}/dev-fixtures/daterange-unified-${variant.id}.html`;
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(fixtureFile, buildFixtureHtml(variant), "utf8");

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(fixtureUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => window.__drpReady === true, null, { timeout: 20000 });
    await page.waitForTimeout(150);

    const popupLayout = await openPicker(page);
    await page.locator("#calendar-popup").screenshot({
      path: path.join(OUT_DIR, `${variant.id}-popup.png`),
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);

    const presetResults = {};
    for (const key of PRESET_KEYS) {
      presetResults[key] = await testPresetSingleClick(page, key);
    }

    const thisYearFromEmpty = await testThisYearFromEmpty(page);
    const thisYearReopen = await testThisYearReopenHighlight(page);
    const manualRange = await testManualRange(page);
    const staleBinding = variant.testStaleBinding ? await testStaleBinding(page) : null;
    const triggerCss = variant.testTriggerCss ? await testTriggerCss(page) : null;

    await page.locator("#date-range-picker").screenshot({
      path: path.join(OUT_DIR, `${variant.id}-trigger.png`),
    });

    const checks = {
      popupOpens: popupLayout.open,
      popupHas8Presets: popupLayout.presetCount === 8,
      popupGridLayout: popupLayout.gridDisplay === "grid" && popupLayout.width >= 280,
      popupDaysRender: popupLayout.dayCount >= 28,
      manualRangeOk: manualRange.singleClickOk && manualRange.displayOk,
      thisYearFromEmptyOk: thisYearFromEmpty.singleClickOk && thisYearFromEmpty.displayOk,
      thisYearSlashFormat: thisYearReopen.displayUsesSlashes && thisYearReopen.displayNotDashFormat,
      thisYearPresetOnReopen: thisYearReopen.presetActiveOnReopen,
    };

    for (const key of PRESET_KEYS) {
      const r = presetResults[key];
      checks[`preset_${key}`] = r.singleClickOk && r.displayOk && r.onChangeFired;
    }

    if (variant.testStaleBinding) {
      checks.staleBindingOk = staleBinding.singleClickOk && staleBinding.displayOk;
    }
    if (variant.testTriggerCss) {
      checks.triggerCssOk =
        triggerCss.ok &&
        triggerCss.gap === "0px" &&
        triggerCss.overflow === "hidden" &&
        triggerCss.iconBlue &&
        triggerCss.flushLeft &&
        triggerCss.flushTop;
    }

    return {
      variant: variant.id,
      title: variant.title,
      presetResults,
      thisYearFromEmpty,
      thisYearReopen,
      manualRange,
      staleBinding,
      triggerCss,
      popupLayout,
      checks,
      failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    };
  } finally {
    await page.close();
    try {
      fs.unlinkSync(fixtureFile);
    } catch {
      /* ignore */
    }
  }
}

function comparePresetParity(allResults) {
  const parity = {};
  const mismatches = [];

  for (const key of PRESET_KEYS) {
    const rows = allResults.map((r) => ({
      variant: r.variant,
      from: r.presetResults[key]?.from || "",
      to: r.presetResults[key]?.to || "",
    }));
    const ref = rows[0];
    const unified = rows.every((row) => row.from === ref.from && row.to === ref.to);
    parity[key] = { unified, rows };
    if (!unified) {
      mismatches.push({ preset: key, rows });
    }
  }

  const thisYearRows = allResults.map((r) => ({
    variant: r.variant,
    from: r.thisYearFromEmpty?.from || "",
    to: r.thisYearFromEmpty?.to || "",
  }));
  const thisYearUnified =
    thisYearRows.length > 0 &&
    thisYearRows.every(
      (row) => row.from === thisYearRows[0].from && row.to === thisYearRows[0].to,
    );

  return { parity, mismatches, thisYearUnified, thisYearRows };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let exitCode = 0;
const browser = await chromium.launch({ headless: true });

try {
  const allResults = [];
  for (const variant of VARIANTS) {
    console.log(`\n=== Testing ${variant.title} (${variant.id}) ===`);
    const result = await runVariant(browser, variant);
    allResults.push(result);
    console.log(`  passed: ${Object.keys(result.checks).length - result.failed.length}/${Object.keys(result.checks).length}`);
    if (result.failed.length) {
      console.log(`  FAILED: ${result.failed.join(", ")}`);
      exitCode = 1;
    } else {
      console.log("  OK");
    }
  }

  const { parity, mismatches, thisYearUnified, thisYearRows } = comparePresetParity(allResults);

  console.log("\n=== Preset date parity (from/to should match across pages) ===");
  for (const key of PRESET_KEYS) {
    const p = parity[key];
    const sample = p.rows.map((r) => `${r.variant}=${r.from}..${r.to}`).join(" | ");
    console.log(`  ${key}: ${p.unified ? "UNIFIED" : "MISMATCH"} — ${sample}`);
    if (!p.unified) exitCode = 1;
  }

  console.log("\n=== This Year (empty → single click) parity ===");
  console.log(
    `  ${thisYearUnified ? "UNIFIED" : "MISMATCH"} — ${thisYearRows.map((r) => `${r.variant}=${r.from}..${r.to}`).join(" | ")}`,
  );
  if (!thisYearUnified) exitCode = 1;

  const summary = {
    generatedAt: new Date().toISOString(),
    variants: allResults.map((r) => ({
      id: r.variant,
      title: r.title,
      failed: r.failed,
      checks: r.checks,
      thisYearFromEmpty: r.thisYearFromEmpty,
      presetDates: Object.fromEntries(
        PRESET_KEYS.map((k) => [k, { from: r.presetResults[k].from, to: r.presetResults[k].to }]),
      ),
    })),
    parity: {
      presets: Object.fromEntries(PRESET_KEYS.map((k) => [k, parity[k].unified])),
      thisYearFromEmpty: thisYearUnified,
      mismatches,
    },
    screenshots: fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")),
  };

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(summary, null, 2));
  console.log(`\nReport: ${path.join(OUT_DIR, "report.json")}`);
  console.log(exitCode === 0 ? "\nALL UNIFIED ✓" : "\nSOME CHECKS FAILED ✗");
} finally {
  await browser.close();
}

process.exit(exitCode);

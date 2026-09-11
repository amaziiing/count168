/**
 * Dashboard perf smoke: login to production, IG group + Company All, time reveals.
 *
 * Usage:
 *   node scripts/playwright-dash-timing.mjs [runs] [--url https://count168.site]
 *
 * Measures ms from clicking the "This Year" preset until:
 *   - kpi      : hero/KPI shows a real (non-zero) value
 *   - pieFirst : Currency card revealed AND at least one real amount
 *   - pieAll   : Currency card revealed AND 2+ real amounts
 *
 * Credentials come from env (never commit real ones):
 *   PW_DASH_COMPANY, PW_DASH_USER, PW_DASH_PASS
 */
import { chromium } from "playwright";

const BASE = process.argv.find((a) => a.startsWith("--url="))?.slice(6) || "https://count168.site";
const COMPANY = process.env.PW_DASH_COMPANY || "95";
const USER = process.env.PW_DASH_USER || "jk";
const PASS = process.env.PW_DASH_PASS || "1";
const RUNS = Number(process.argv[2] || 3);

function info(msg) {
  console.log(`  · ${msg}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#company-id", { timeout: 30000 });
  await page.locator("#company-id").fill(COMPANY);
  await page.locator("#user-id").fill(USER);
  await page.locator("#password").fill(PASS);
  await Promise.all([
    page.waitForURL(/dashboard|home|member/, { timeout: 60000 }).catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click(),
  ]);
  await page.waitForTimeout(1500);
  if (!page.url().includes("/dashboard")) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }
  await page.waitForSelector(".user-gc-inline-row", { timeout: 30000 });
  await page.waitForTimeout(2000);

  // IG group + Company All.
  const groupRow = page.locator(".user-gc-inline-row").nth(0);
  const igBtn = groupRow.locator("button", { hasText: /^IG$/ }).first();
  if ((await igBtn.count()) > 0 && !((await igBtn.getAttribute("class")) || "").includes("is-on")) {
    await igBtn.click();
    await page.waitForTimeout(1200);
  }
  const companyRow = page
    .locator(".user-gc-inline-row")
    .filter({ has: page.locator(".user-gc-inline-label", { hasText: /company/i }) })
    .first();
  const allBtn = companyRow.locator("button", { hasText: /^All$/ }).first();
  if ((await allBtn.count()) > 0 && !((await allBtn.getAttribute("class")) || "").includes("is-on")) {
    await allBtn.click();
    await page.waitForTimeout(2500);
  }
}

await login();
info(`scope ready`);

const results = [];
const heroSel = ".dashboard-summary-hero-value";

for (let run = 0; run < RUNS; run += 1) {
  // The preset buttons live in #calendar-popup (display:none until opened) — drive via
  // data-open + dispatch click (listener is capture-phase on the button).
  const clickPreset = (key) =>
    page.evaluate((k) => {
      const el = document.getElementById("calendar-popup");
      if (el) el.setAttribute("data-open", "true");
      const btn = document.querySelector(`.transaction-calendar-preset[data-period-key="${k}"]`);
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }, key);

  await clickPreset("lastMonth");
  await page.waitForTimeout(1200);

  const tClick = Date.now();
  const okThis = await clickPreset("thisYear");
  if (!okThis) {
    console.error("thisYear preset not found — abort run");
    break;
  }

  let tKpi = null;
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const txt = (el.innerText || "").trim();
        return txt !== "" && txt !== "0.00" && /[0-9]/.test(txt);
      },
      heroSel,
      { timeout: 30000 }
    );
    tKpi = Date.now() - tClick;
  } catch {
    tKpi = "timeout(30s)";
  }

  let tPieFirst = null;
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el || !(el.className || "").includes("is-revealed")) return false;
        const rows = el.querySelectorAll(".dashboard-summary-currency-row");
        for (const row of rows) {
          const amt = row.querySelector(".dashboard-summary-currency-amount");
          if (amt && /[1-9]/.test((amt.innerText || "").replace(/[.,]/g, ""))) return true;
        }
        return false;
      },
      ".dashboard-summary-currency-list",
      { timeout: 30000 }
    );
    tPieFirst = Date.now() - tClick;
  } catch {
    tPieFirst = "timeout(30s)";
  }

  let tPieAll = null;
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el || !(el.className || "").includes("is-revealed")) return false;
        const rows = el.querySelectorAll(".dashboard-summary-currency-row");
        if (rows.length < 2) return false;
        let nonZero = 0;
        for (const row of rows) {
          const amt = row.querySelector(".dashboard-summary-currency-amount");
          if (amt && /[1-9]/.test((amt.innerText || "").replace(/[.,]/g, ""))) nonZero += 1;
        }
        return nonZero >= 2;
      },
      ".dashboard-summary-currency-list",
      { timeout: 30000 }
    );
    tPieAll = Date.now() - tClick;
  } catch {
    tPieAll = "timeout(30s)";
  }

  results.push({ tKpi, tPieFirst, tPieAll });
  info(`run ${run + 1}: kpi=${tKpi}ms  pieFirst=${tPieFirst}ms  pieAll=${tPieAll}ms`);
  await page.waitForTimeout(600);
}

console.log("\n=== SUMMARY (This Year, IG + Company All) ===");
for (const [i, r] of results.entries()) {
  console.log(`run ${i + 1}: kpi=${r.tKpi}ms  pieFirst=${r.tPieFirst}ms  pieAll=${r.tPieAll}ms`);
}
await browser.close();

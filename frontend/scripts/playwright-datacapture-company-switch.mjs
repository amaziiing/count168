/**
 * Playwright check: Data Capture company switch should not remount the page shell.
 *
 * Env (optional):
 *   DC_BASE_URL=https://count168.site
 *   DC_LOGIN_GROUP=...
 *   DC_LOGIN_USER=...
 *   DC_LOGIN_PASS=...
 *
 * Run:
 *   node ./scripts/playwright-datacapture-company-switch.mjs
 *   node ./scripts/playwright-datacapture-company-switch.mjs --headed
 */
import { chromium } from "playwright";

const BASE = process.env.DC_BASE_URL || "https://count168.site";
const HEADED = process.argv.includes("--headed") || process.env.HEADED === "1";

async function maybeLogin(page) {
  const group = process.env.DC_LOGIN_GROUP;
  const user = process.env.DC_LOGIN_USER;
  const pass = process.env.DC_LOGIN_PASS;
  if (!group || !user || !pass) return false;

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: /company|group/i }).fill(group);
  await page.getByRole("textbox", { name: /username/i }).fill(user);
  await page.getByRole("textbox", { name: /password/i }).fill(pass);
  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL(/\/(dashboard|datacapture|process)/, { timeout: 30000 });
  return true;
}

async function measureCompanySwitchFlicker(page) {
  await page.goto(`${BASE}/datacapture`, { waitUntil: "domcontentloaded" });
  const onLogin = /\/login/i.test(page.url());
  if (onLogin) {
    return {
      skipped: true,
      reason: "Not logged in. Set DC_LOGIN_GROUP, DC_LOGIN_USER, DC_LOGIN_PASS to run the full test.",
    };
  }

  try {
    await page.waitForSelector("body.datacapture-page", { timeout: 30000 });
    await page.waitForSelector("#dataCaptureForm", { timeout: 30000 });
    await page.waitForSelector(".user-gc-inline-row--company .user-gc-segment", { timeout: 30000 });
  } catch {
    return {
      skipped: true,
      reason: `Expected datacapture page; got ${page.url()}`,
    };
  }

  const companyPills = page.locator(".user-gc-inline-row--company .user-gc-segment");
  const count = await companyPills.count();
  if (count < 2) {
    return { skipped: true, reason: `Need at least 2 company pills (found ${count}). Login or pick a group first.` };
  }

  const container = page.locator(".container").first();
  const form = page.locator("#dataCaptureForm");
  const grid = page.locator("#dataTable");

  await container.waitFor({ state: "visible" });

  const persistMarker = await page.evaluate(() => {
    const mark = (el) => {
      if (!el) return false;
      el.dataset.dcPersist = "1";
      return true;
    };
    const containerEl = document.querySelector(".container");
    const formEl = document.getElementById("dataCaptureForm");
    const gridEl = document.getElementById("dataTable");
    return {
      container: mark(containerEl),
      form: mark(formEl),
      grid: mark(gridEl),
    };
  });

  const activeIdx = await companyPills.evaluateAll((nodes) =>
    nodes.findIndex((n) => n.classList.contains("is-on") || n.classList.contains("active")),
  );
  const targetIdx = activeIdx <= 0 ? 1 : 0;
  const targetLabel = await companyPills.nth(targetIdx).innerText();

  const remountCounter = await page.evaluate(() => {
    window.__dcSwitchRemounts = 0;
    const containerEl = document.querySelector(".container");
    if (!containerEl?.parentElement) return false;
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList" && r.target === containerEl.parentElement) {
          window.__dcSwitchRemounts += 1;
        }
      }
    });
    obs.observe(containerEl.parentElement, { childList: true });
    window.__dcSwitchObserver = obs;
    return true;
  });

  await companyPills.nth(targetIdx).click();
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const containerEl = document.querySelector(".container");
    const formEl = document.getElementById("dataCaptureForm");
    const gridEl = document.getElementById("dataTable");
    window.__dcSwitchObserver?.disconnect();
    return {
      containerSame: containerEl?.dataset.dcPersist === "1",
      formSame: formEl?.dataset.dcPersist === "1",
      gridSame: gridEl?.dataset.dcPersist === "1",
      remounts: window.__dcSwitchRemounts || 0,
    };
  });

  return {
    skipped: false,
    activeIdx,
    targetIdx,
    targetLabel: targetLabel?.trim(),
    marked: persistMarker,
    observerOk: remountCounter,
    ...after,
    pass: after.containerSame && after.formSame && after.gridSame && after.remounts === 0,
  };
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage();

try {
  const loggedIn = await maybeLogin(page);
  const result = await measureCompanySwitchFlicker(page);
  console.log(JSON.stringify({ loggedIn, ...result }, null, 2));
  if (result.skipped) process.exitCode = 2;
  else if (!result.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

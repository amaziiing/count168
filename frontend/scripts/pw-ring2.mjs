import { chromium } from "playwright";
const BASE = "https://count168.site";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("#company-id").fill("95");
await page.locator("#user-id").fill("jk");
await page.locator("#password").fill("1");
await Promise.all([
  page.waitForURL(/dashboard|home|member/, { timeout: 60000 }).catch(() => {}),
  page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click(),
]);
await page.waitForTimeout(2000);
if (!page.url().includes("/dashboard")) { await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}); }
await page.waitForSelector(".user-gc-inline-row", { timeout: 30000 });
await page.waitForTimeout(1500);
const groupRow = page.locator(".user-gc-inline-row").nth(0);
const igBtn = groupRow.locator("button", { hasText: /^IG$/ }).first();
if ((await igBtn.count()) > 0 && !((await igBtn.getAttribute("class")) || "").includes("is-on")) {
  await igBtn.click(); await page.waitForTimeout(1200);
}
const companyRow = page.locator(".user-gc-inline-row").filter({ has: page.locator(".user-gc-inline-label", { hasText: /company/i }) }).first();
const allBtn = companyRow.locator("button", { hasText: /^All$/ }).first();
if ((await allBtn.count()) > 0 && !((await allBtn.getAttribute("class")) || "").includes("is-on")) {
  await allBtn.click(); await page.waitForTimeout(10000);
}

const info = await page.evaluate(() => {
  const card = document.querySelector(".dashboard-panel-card--summary");
  if (!card) return { err: "no card" };
  const key = Object.keys(card).find((k) => k.startsWith("__reactFiber$"));
  let fiber = card[key];
  let earningsMap = null, coreLabel = null, coreValue = null, coreNote = null, slices = null, colorMap = null;
  let depth = 0;
  while (fiber && depth < 80 && !slices) {
    depth += 1;
    const p = fiber.memoizedProps;
    const s = fiber.memoizedState;
    if (p) {
      if (p.earningsMap) { earningsMap = Object.fromEntries(Object.entries(p.earningsMap).map(([k,v]) => [k, typeof v==="number"?v.toFixed(2):v])); }
      if (p.coreLabel !== undefined) coreLabel = p.coreLabel;
      if (p.coreValue !== undefined) coreValue = p.coreValue;
      if (p.coreNote !== undefined) coreNote = p.coreNote;
      if (p.slices) {
        slices = p.slices.map(s => ({ key:s.stableKey, color:s.color, val:typeof s.value==="number"?s.value.toFixed(2):s.value, pct:s.pct }));
      }
      if (p.COLORPALETTE) { colorMap = p.COLORPALETTE; }
    }
    fiber = fiber.return;
  }
  const token = card.querySelector(".dashboard-summary-active-token");
  return { earningsMap, coreLabel, coreValue, coreNote, slices, colorMap, tokenText: token?.innerText || "(no token)" };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

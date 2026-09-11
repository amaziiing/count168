import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.goto("https://count168.site/login", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("#company-id").fill("95");
await page.locator("#user-id").fill("jk");
await page.locator("#password").fill("1");
await page.locator("button[type=submit]").first().click();
await page.waitForTimeout(2500);
if (!page.url().includes("/dashboard")) { await page.goto("https://count168.site/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}); }
await page.waitForSelector(".user-gc-inline-row", { timeout: 30000 });
await page.waitForTimeout(1500);

// IG + All
const gRow = page.locator(".user-gc-inline-row").nth(0);
const ig = gRow.locator("button", { hasText: /^IG$/ }).first();
if (await ig.count() > 0) { await ig.click(); await page.waitForTimeout(2000); }
const cRow = page.locator(".user-gc-inline-row").filter({ has: page.locator(".user-gc-inline-label", { hasText: /company/i }) }).first();
const all = cRow.locator("button", { hasText: /^All$/ }).first();
if (await all.count() > 0) { await all.click(); await page.waitForTimeout(15000); }

const info = await page.evaluate(() => {
  const card = document.querySelector(".dashboard-panel-card--summary");
  if (!card) return { err: "no card" };
  const sectors = [...card.querySelectorAll(".recharts-sector")];
  const fills = sectors.map(s => s.getAttribute("fill")).join(", ");
  const center = card.querySelector(".dashboard-summary-pie-center");
  const centerText = center ? center.innerText.trim().replace(/\s+/g, " ") : "(hidden)";
  
  // Check if currency rows exist below the pie
  const rows = [...card.querySelectorAll(".dashboard-summary-currency-row")];
  const rowCount = rows.length;
  const rowTexts = rows.map(r => r.innerText.trim().replace(/\s+/g, " ")).slice(0, 5);

  return { sectors: sectors.length, fills, centerText, rowCount, rowTexts };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

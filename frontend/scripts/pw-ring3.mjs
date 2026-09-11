import { chromium } from "playwright";
const BASE = "https://count168.site";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
// capture network requests to dashboard_api
const apiReqs = [];
page.on("request", (r) => { if (r.url().includes("dashboard_api")) apiReqs.push({ url: r.url().replace(/[?&]_=\d+/,"").replace(/([?&])([a-z_]+)=([^&?]*)/g,"$1$2=..."), method: r.method() }); });
const apiResps = [];
page.on("response", (r) => { if (r.url().includes("dashboard_api")) { apiResps.push({ url: r.url().replace(/[?&]_=\d+/,"").replace(/([?&])([a-z_]+)=([^&?]*)/g,"$1$2=..."), status: r.status(), time: Math.round(Date.now()/1000)%100000 }); } });

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("#company-id").fill("95");
await page.locator("#user-id").fill("jk");
await page.locator("#password").fill("1");
await Promise.all([
  page.waitForURL(/dashboard|home|member/, { timeout: 60000 }).catch(() => {}),
  page.locator('button[type="submit"], button:has-text("Login")').first().click(),
]);
await page.waitForTimeout(2000);
if (!page.url().includes("/dashboard")) { await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}); }
await page.waitForSelector(".user-gc-inline-row", { timeout: 30000 });
await page.waitForTimeout(1500);
// Clear previous API calls
apiReqs.length = 0; apiResps.length = 0;
// Click IG
const groupRow = page.locator(".user-gc-inline-row").nth(0);
const igBtn = groupRow.locator("button", { hasText: /^IG$/ }).first();
if ((await igBtn.count()) > 0 && !((await igBtn.getAttribute("class")) || "").includes("is-on")) {
  await igBtn.click(); await page.waitForTimeout(2000);
}
// Clear again before All
apiReqs.length = 0; apiResps.length = 0;
// Click All Company
const companyRow = page.locator(".user-gc-inline-row").filter({ has: page.locator(".user-gc-inline-label", { hasText: /company/i }) }).first();
const allBtn = companyRow.locator("button", { hasText: /^All$/ }).first();
if ((await allBtn.count()) > 0 && !((await allBtn.getAttribute("class")) || "").includes("is-on")) {
  await allBtn.click(); await page.waitForTimeout(10000);
}
console.log("=== API requests to dashboard_api (POST) ===");
for (const r of apiReqs) { console.log(r.method, r.url); }
console.log("=== API responses ===");
for (const r of apiResps) { console.log(r.status, r.time, r.url); }

// Check DOM for pie data
const compState = await page.evaluate(() => {
  const card = document.querySelector(".dashboard-panel-card--summary");
  if (!card) return {err:"no card"};
  // Try to find the component via React fiber
  const key = Object.keys(card).find(k => k.startsWith("__reactFiber$"));
  let fiber = card[key], res = {}, d = 0;
  while (fiber && d < 120) { d++;
    const m = fiber.memoizedState;
    if (m && typeof m === "object" && !Array.isArray(m)) {
      if ("earningsMap" in m) { res.earningsMap = Object.keys(m.earningsMap||{}); }
      if ("slices" in m) { res.slicesLen = m.slices?.length; }
      if ("coreLabel" in m) { res.coreLabel = m.coreLabel; res.coreValue=m.coreValue; res.coreNote=m.coreNote; }
      if ("panelCurrencyRows" in m) { res.panelRowsLen = m.panelCurrencyRows?.length; }
    }
    // Also check hooks (linked list)
    let hook = fiber.memoizedState;
    while (hook) {
      if (hook.memoizedState && typeof hook.memoizedState === "object" && !Array.isArray(hook.memoizedState)) {
        const h = hook.memoizedState;
        if (h.earningsMap) res.hook_earningsKeys = Object.keys(h.earningsMap);
        if (h.slices) res.hook_slicesLen = h.slices?.length;
        if (h.panelCurrencyRows) res.hook_panelRowsLen = h.panelCurrencyRows?.length;
      }
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  res.sectorsInDOM = [...card.querySelectorAll(".recharts-sector")].length;
  return res;
});
console.log("=== Component state ===");
console.log(JSON.stringify(compState, null, 1));

// Screenshot the pie area
const pieWrap = page.locator(".dashboard-summary-pie-wrap").first();
if ((await pieWrap.count()) > 0) await pieWrap.screenshot({ path: "scripts/pie-snap.png" });
await browser.close();

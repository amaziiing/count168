import { chromium } from "playwright";
const BASE = "https://count168.site";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#company-id", { timeout: 30000 });
await page.locator("#company-id").fill("95");
await page.locator("#user-id").fill("jk");
await page.locator("#password").fill("1");
await Promise.all([
  page.waitForURL(/dashboard|home|member/, { timeout: 60000 }).catch(() => {}),
  page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click(),
]);
await page.waitForTimeout(1500);
if (!page.url().includes("/dashboard")) { await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}); }
await page.waitForSelector(".user-gc-inline-row", { timeout: 30000 });
await page.waitForTimeout(2000);
const groupRow = page.locator(".user-gc-inline-row").nth(0);
const igBtn = groupRow.locator("button", { hasText: /^IG$/ }).first();
if ((await igBtn.count()) > 0 && !((await igBtn.getAttribute("class")) || "").includes("is-on")) { await igBtn.click(); await page.waitForTimeout(1200); }
const companyRow = page.locator(".user-gc-inline-row").filter({ has: page.locator(".user-gc-inline-label", { hasText: /company/i }) }).first();
const allBtn = companyRow.locator("button", { hasText: /^All$/ }).first();
if ((await allBtn.count()) > 0 && !((await allBtn.getAttribute("class")) || "").includes("is-on")) { await allBtn.click(); await page.waitForTimeout(9000); }

const info = await page.evaluate(() => {
  const card = document.querySelector(".dashboard-panel-card--summary");
  if (!card) return { err: "no card" };
  const pieWrap = card.querySelector(".dashboard-summary-pie-wrap");
  const svg = card.querySelector("svg.recharts-surface");
  const pieEl = card.querySelector(".recharts-pie");
  const sectors = [...card.querySelectorAll(".recharts-sector")];
  const center = card.querySelector(".dashboard-summary-pie-center");
  const pieChart = card.querySelector(".dashboard-summary-pie-chart-shell");
  
  // Check inner/outer radius from pie slices
  const paths = sectors.map((s) => ({
    fill: s.getAttribute("fill"),
    d: (s.getAttribute("d") || "").slice(0, 80),
  }));
  
  // ring: inspect Pie component props (innerRadius/outerRadius) from fiber
  const key = Object.keys(card).find((k) => k.startsWith("__reactFiber$"));
  let fiber = card[key];
  let pieProps = null;
  let depth = 0;
  while (fiber && depth < 60) {
    depth += 1;
    if (fiber.memoizedProps?.innerRadius !== undefined) {
      pieProps = {
        innerRadius: fiber.memoizedProps.innerRadius,
        outerRadius: fiber.memoizedProps.outerRadius,
        cx: fiber.memoizedProps.cx,
        cy: fiber.memoizedProps.cy,
        paddingAngle: fiber.memoizedProps.paddingAngle,
        data: fiber.memoizedProps.data?.length + " slices",
      };
      break;
    }
    fiber = fiber.return;
  }

  return {
    wrapBox: pieWrap ? { w: pieWrap.offsetWidth, h: pieWrap.offsetHeight } : null,
    svgBox: svg ? { w: svg.getAttribute("width"), h: svg.getAttribute("height") } : null,
    sectorCount: sectors.length,
    centerText: center ? center.innerText.replace(/\n/g, " ") : "(none)",
    centerDisplay: center ? window.getComputedStyle(center).display : "none",
    pieProps,
    pieShell: pieChart ? {
      w: pieChart.offsetWidth,
      h: pieChart.offsetHeight,
    } : null,
    paths,
  };
});
console.log(JSON.stringify(info, null, 1));
// Also take a screenshot for the record
await page.locator(".dashboard-panel-card--summary").screenshot({ path: "scripts/pie-ring.png" }).catch(() => {});
await browser.close();

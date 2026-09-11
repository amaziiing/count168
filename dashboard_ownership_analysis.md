# Dashboard 金额抓取方式 与 Ownership 分成算法 — 分析记录

> 说明：仓库里没有专门叫 `dashboard.test.js` 的测试文件。与"金额抓取"直接相关的测试，是
> `frontend/src/pages/datacapture/paste/core/*.test.js`（数据录入粘贴解析），这些测试保证了
> 报表金额能被正确抓取、最终汇入交易表 → Dashboard 聚合。以下按"抓取 → 汇总 → 分成"的链路说明。

## 1. 金额抓取（Data Capture 粘贴解析，被 test 覆盖的部分）

路径：`frontend/src/pages/datacapture/paste/core/`

这一层负责把用户从各家上游系统（fruit16 dailyWinlose、Citibet Agent PT Report、
King855、PS38、Gamingsoft Invoice、WOS 等）**复制粘贴**过来的表格文本 / HTML，解析成
可写入网格的金额矩阵。每个上游格式对应一个 `xxxPasteHelper.js` + 对应的
`xxxPasteHelper.test.js`：

| 来源 | Helper 文件 | 测试文件 |
|---|---|---|
| fruit16 Win/Lose 只复制 Sub Total + Grand Total 两行 | `dataCaptureWinLoseFooterOnlyPasteHelper.js` | 同名 `.test.js` |
| Citibet Agent PT Report | `dataCaptureCitibetAgentPtReportPasteHelper.js` | 同名 `.test.js` |
| King855 Win/Loss | `dataCaptureKing855WinLossPasteHelper.js` | 同名 `.test.js` |
| PS38 Win/Loss | `dataCapturePs38WinLossPasteHelper.js` | 同名 `.test.js` |
| Gamingsoft Invoice | `dataCaptureGamingSoftInvoicePasteHelper.js` | 同名 `.test.js` |
| WOS Win/Loss Detail | `dataCaptureWosWinLossDetailPasteHelper.js` | 同名 `.test.js` |
| 通用粘贴格式判定 | `dataCapturePasteDetect.js` | `dataCapturePasteDetect.test.js` |
| 粘贴矩阵清洗/对齐 | `dataCapturePasteMatrixSanitize.js`, `dataCaptureTotalRowAlign.js` | 对应 `.test.js` |

**抓取方式的共同套路**（以 `dataCaptureWinLoseFooterOnlyPasteHelper.js` 为例，详见
[frontend/src/pages/datacapture/paste/core/dataCaptureWinLoseFooterOnlyPasteHelper.js](frontend/src/pages/datacapture/paste/core/dataCaptureWinLoseFooterOnlyPasteHelper.js)）：

1. **来源判定**：先用正则/关键字判断粘贴内容是不是这个上游的格式（如 `SUB TOTAL` /
   `GRAND TOTAL` 标签、`upline payment` 等特征词），避免误吃别的格式。
2. **金额识别**：`isMoneyOrCount()` — 用正则 `/^-?\d+(?:\.\d+)?$/`（先去掉千分位逗号，
   括号负数 `(123)` → `-123`）判断一个 token 是不是金额/数量。
3. **两种输入形态都处理**：
   - **HTML 表格**（`parseHtmlFooterOnlyTable`）：解析 `<tr>/<td>`，处理 `colspan`、
     单元格内多行堆叠（`<br>` 当换行）等情况；
   - **纯文本**（Tab 分隔 / 无 Tab 按空格 flatten）：`flattenNonEmptyTokens()` 把整段
     文本拆成 token 数组，并合并 "SUB"+"TOTAL" → "SUB TOTAL" 这类被空格拆开的标签。
4. **修复错位**：不同网站复制出来的表格经常"列错位/转置/交错"（column-major、
   相邻两行 SUB/GRAND 交错），代码里专门写了 `deinterleaveAdjacentFooterLabels`、
   `reshapeVerticalFooterTokens`、`alignFooterOnlySubGrandMatrix` 来把这些畸形粘贴
   还原成对齐的二维矩阵。
5. **写入网格**：最终矩阵通过 `applyDataMatrixToGrid()` 灌入 Data Capture 表格 UI，
   用户确认后提交，落库为 `transactions` / 数据录入相关表的记录。

测试文件（`.test.js`）就是针对上面这些函数，喂各种"畸形粘贴"样本（转置、错位、
括号负数、千分位逗号等），断言解析出的矩阵/金额是否正确 —— 这就是"金额抓取的测试"。

## 2. Dashboard 页面怎么把这些金额聚合出来（更正版）

> ⚠️ 更正：我第一版说"按 transaction_type 全局 SUM"是不准确的、说了个大概但漏了最关键的一层。
> 真实机制是**先按 `account.role` 筛出这个角色名下的账户，再只对这批账户 ID 的交易求和**——
> 这也是为什么"PROFIT 角色账户的交易总额"会正好等于 KPI Card 的 Profit 数字：因为 KPI 就是
> 直接拿这批账户的 SUM 结果，不是先全表算再按公式拼出来的。

后端 `api/transactions/dashboard_api.php` 主循环（约
[dashboard_api.php:4038](api/transactions/dashboard_api.php:4038)）：

```php
$roles = $earningsOnly ? ['EXPENSES', 'PROFIT'] : ['CAPITAL', 'EXPENSES', 'PROFIT'];
foreach ($roles as $role) {
    // 第 1 步：按角色找账户
    // 第 2 步：只 SUM 这批账户相关的交易
}
```

### 2.1 Profit（角色 = PROFIT）
- **第 1 步 — 找账户**：`dashboardRoleFilterSql('PROFIT')` 生成
  `UPPER(TRIM(a.role)) = 'PROFIT'`，去 `account` 表（JOIN `account_company`）里筛出
  这个公司下 `role = 'PROFIT'` 的账户，得到一组 `account_ids`
  （[dashboard_api.php:4081-4098](api/transactions/dashboard_api.php:4081)）。
- **第 2 步 — 只对这批账户求和**：所有 SQL 都带
  `t.account_id IN ($account_ids)` 或 `t.from_account_id IN ($account_ids)`
  （[dashboard_api.php:4196](api/transactions/dashboard_api.php:4196)、
  [4221](api/transactions/dashboard_api.php:4221)），`CASE WHEN transaction_type = ...`
  只是在"已经限定为 PROFIT 账户"的交易里，按业务语义决定金额的正负号
  （WIN 自动结算 `+amount`、LOSE 自动结算 `-amount`、手动录入符号相反、
  RATE/PAYMENT/RECEIVE/CONTRA/CLEAR 按应收应付方向处理等）。
- 所以：**"PROFIT 角色账户的交易额总和" = KPI Card 的 Profit**，这个等式是成立的，
  因为 KPI 本身就是这样算出来的，不是巧合。

### 2.2 Expenses（角色 = EXPENSES）
和 Profit 不是同一套查询模板，代码里明确写了注释
"EXPENSES period uses search_api-aligned wl bundle only"：
- **第 1 步 — 找账户**：`dashboardDiscoverExpenseAccounts()`
  （[dashboard_api.php:2830](api/transactions/dashboard_api.php:2830)），用
  `dashboardSqlExpensesRoleMatch()` 匹配 `UPPER(TRIM(a.role)) IN ('EXPENSES', 'EXPENSE')`
  （注意兼容单复数两种历史写法），同样从 `account` 表按角色筛账户。EXPENSES 账户可能挂在
  集团实体公司上而交易发生在子公司账本，所以 `dashboardResolveRoleScopeCompanyIds()`
  还会把同集团的 group-entity 公司也纳入扫描范围。
- **第 2 步 — 专用聚合函数**：不复用 Profit 那套 `SUM(CASE transaction_type...)`，而是
  `dashboardExpensesBuildWinLossBundle()`（[dashboard_api.php:3044](api/transactions/dashboard_api.php:3044)，
  处理 EXPENSES 账户下的 WIN/LOSE/ADJUSTMENT）+
  `dashboardExpensesBuildCrDrBundle()`（[dashboard_api.php:3316](api/transactions/dashboard_api.php:3316)，
  处理 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM/RATE 类 Cr/Dr），两者都严格限定
  `account_id IN (EXPENSES账户ID)`，逻辑上要和 Transaction List / search_api 的
  `category=EXPENSES` 口径完全对齐（代码注释多处强调 "aligned with search_api" /
  "aligned with Transaction List"）。
- 所以 Expenses 抓的确实是 **EXPENSES 角色账户的交易总额**，只是用的是一套独立的、
  更贴近 search_api 口径的构建函数，不是简单套用 Profit 的那套 CASE 模板。

### 2.3 重要例外：CLEAR 类型交易不计入 PROFIT / EXPENSES 的 KPI

Transaction List 页面把交易金额展示成 **Win/Loss 列** 和 **Cr/Dr 列** 两栏，Dashboard 的
Profit（对 EXPENSES 同理）本质是这两栏这期间的总和——但有一个专门的例外：

```php
// dashboardShouldExcludeClearForRole()（dashboard_api.php:363）
// - 对 CAPITAL：不排除（CLEAR 与 CONTRA 行为一致）
// - 对 EXPENSES/PROFIT：排除 CLEAR（无论是 To 还是 From）
```

也就是说，`transaction_type = 'CLEAR'` 的交易，**Transaction List 页面正常显示**在 Cr/Dr 列
（供对账用），但计算 PROFIT / EXPENSES 角色的 period_total 时，SQL 会带上
`AND t.transaction_type <> 'CLEAR'`（见 [dashboard_api.php:4215](api/transactions/dashboard_api.php:4215)
等多处 `.$clearFilter`），把 CLEAR 的金额从 KPI 里过滤掉。

**实例**：某公司这期 Win/Loss = 71,253.36，Cr/Dr = -71,253.34（几乎完全对冲，
Balance 只剩 0.02）——这个 Cr/Dr 基本全是 CLEAR 类型（批量核销/清账）。
Dashboard Profit KPI 最终 = **71,253.36**，正好等于 Win/Loss 那列，"看起来像只抓了
Win/Loss"，实际是 `Win/Loss + (Cr/Dr 中排除 CLEAR 后的剩余部分 ≈ 0)`——公式没变，
只是这期 Cr/Dr 恰好全是被排除的 CLEAR，所以显示上等于纯 Win/Loss。

对照之前 C168 那个例子（一笔 **CONTRA** 交易，1,680.00）：CONTRA **不在**排除名单里，
所以正常计入 Profit；同样是 Cr/Dr 类型，CONTRA 会被算、CLEAR 不会被算——这是刻意的角色级过滤，
不是漏抓。

**这条规则的来历（git 历史，非猜测）**：旧版一开始是**完全不排除 CLEAR** 的：
```php
// 旧版（4288bdea8 之前）
// 与 Transaction List/search_api 口径对齐：不排除 CLEAR（EXPENSES 也要算入）
return false;
```
CLEAR 当时跟 CONTRA/PAYMENT 一样正常计入 Profit/Expenses，结果导致一个 bug——commit
`4288bdea8`（"profit amount will be include when during clear prob fixed"，2026-05-28）
把 CLEAR 从 **PROFIT** 角色里排除掉；一周后 commit `8a3807ee2`（2026-06-03）又发现
**EXPENSES** 角色也有同样问题，扩大排除范围到现在这个 `PROFIT || EXPENSES` 版本。
**结论：这不是"旧版用别的机制处理了未结清部分"，而是旧版本身就是 bug，现在这条排除规则
就是 bug 修复后的最终结果**，CAPITAL 角色则从头到尾都正常把 CLEAR 算进去。

### 2.4 结果打包
两个角色算出来的 `period_total`（以及 CAPITAL 角色，用于余额类展示）打包成
`period_total.profit` / `period_total.expenses` 等字段返回给前端，前端
`dashboardKpi.js` 再做 `netProfit = profit + (expenses>0 ? -expenses : expenses)`
之类的展示层处理（见第 3 节）。

前端 `frontend/src/pages/dashboard/lib/dashboardKpi.js`：
- `netProfitFromDashboardPayload()` / `computeKpiMetrics()`：
  `netProfit = profit + (expenses>0 ? -expenses : expenses)`（Expenses 展示为负数）。
- KPI 卡片、走势图、Earnings 饼图分别调用这些函数把后端返回的原始数字格式化展示。

## 3. Ownership（分成）算法怎么抓、怎么算

分两层：**后端读取分成配置** + **前端把配置换算成一个乘数应用到 netProfit**。

### 3.1 后端：读取分成比例
函数：`dashboardLoadCompanyDashboardOwnership()`
（[api/transactions/dashboard_api.php:1392](api/transactions/dashboard_api.php:1392)）

- 数据表：`company_ownership` / `company_ownership_history`（按公司维度的直接持股 or
  与某个 partner group 的股权比例）、`group_ownership` / `group_ownership_history`
  （集团层面，账号在集团里的分成比例）。是否用 `_history` 表由日期决定
  （`dashboardResolveOwnershipMonthFromDate`：查历史月份用带月份快照的 history 表，
  当月用 live 表）—— 这样过去月份的分成比例改了也不会影响历史 Dashboard 数字。
- 查询顺序：
  1. **直接持股**：`SELECT percentage FROM company_ownership WHERE company_id=? AND
     account_id=? AND owner_type=?` → `ownership_percentage`（有直接持股就跳过下面的
     集团链路，`skipGroupChain`）。
  2. **集团链路**（无直接持股时）：
     - 若指定了 `viewGroup`，先尝试 `dashboardResolveEarningsPathProduct()`
       算"多层集团路径"的连乘比例（子公司→集团A→集团B…），得到
       `group_equity_percentage`；
     - 再查该 group 下这个账号的 `group_ownership.percentage` 作为
       `group_account_percentage`（账号在集团里能分到的比例）；
     - 否则退回单层：从 `company_ownership WHERE owner_type='group'` 找该公司挂在
       哪个 `partner_group_id` 下、股权多少（`group_equity_percentage`），再查
       `group_ownership` 里该账号在这个 group 的比例（`group_account_percentage`）。
- 返回给前端的字段：`ownership_percentage`、`group_equity_percentage`、
  `group_account_percentage`、`has_group_ownership`、`has_ownership_setup`。

### 3.2 前端：把分成配置换算成乘数
函数：`resolveEarningsMultiplier()`（内部）→
`resolveEffectiveOwnershipPct()` / `resolvePanelEarningsPct()`
（[frontend/src/pages/dashboard/lib/dashboardKpi.js:148](frontend/src/pages/dashboard/lib/dashboardKpi.js:148)）

优先级（从高到低）：
1. **Group 聚合口径**（`_group_aggregate_earnings`）：直接用
   `group_account_percentage / 100` 作为乘数。
2. **Link multiplier**（`_link_multiplier`，公司间转账链路带来的连乘系数，
   非 1 才生效）：`linkMul × (group_account_percentage>0 ? account%/100 : 1)`。
3. **直接持股** `ownership_percentage > 0`：直接用 `directPct = ownership_percentage/100`。
4. **集团两段乘**：`(group_equity_percentage/100) × (group_account_percentage/100)`
   —— 即"公司在集团里的股权占比" × "我在集团里的分成占比"。
5. 都没有配置 → 乘数为 0（不显示 Earnings，除非是"子公司下钻"场景等特殊 fallback）。

最终：
```
Earnings = netProfit × 分成乘数
```
`netProfit` 就是第 2 节算出来的 `profit + 负号处理后的 expenses`。

子公司下钻场景（`subsidiaryGroupDrillDown`）逻辑更严格：必须
`has_ownership_setup` 为真才算，且不允许 fallback 到"无配置=100%"，避免误算。

## 4. KPI Card 全貌 + Earnings 分成实例（含 Ownership 页面截图对应关系）

### 4.1 四张 KPI Card
`DashboardKpiGrid.jsx` 固定渲染 Profit / Expenses / Net Profit 三张卡
（[DashboardKpiGrid.jsx:9-35](frontend/src/pages/dashboard/components/DashboardKpiGrid.jsx:9)），
第四张 **Earnings** 卡靠 `kpi.showEarnings` 控制是否渲染
（[DashboardKpiGrid.jsx:36](frontend/src/pages/dashboard/components/DashboardKpiGrid.jsx:36)）。

- `showEarnings` = `viewerHasEarningsConfig()`（[dashboardKpi.js:41](frontend/src/pages/dashboard/lib/dashboardKpi.js:41)），
  判断的是"**当前登录账户本人**有没有被分配 ownership 配置"（直接持股 % > 0，或有集团分成链路），
  **不是硬编码判断 session role === owner**。
- 后端把 session 角色换算成 `owner_type`（[dashboard_api.php:1268](api/transactions/dashboard_api.php:1268)）：
  `role/user_type = owner` → `owner_type='owner'`；`role ∈ {user, partnership, audit, member}`
  （即 Partner 及以下）→ `owner_type='user'`，然后各自去查 `company_ownership` 里
  `account_id = 自己`、`owner_type = 自己的类型` 这一行。
- 所以实践中"只有 Owner 能看到 Earnings 卡"是**结果**（因为通常只有 Owner 账户会被分配持股），
  但机制上是"看这个账户有没有被分配百分比"，理论上 Partner 账户如果也被分配了百分比，
  一样会出现第四张卡。
- **Profit / Expenses 没有 Game / Bank 区分**——整个 `dashboard_api.php` 里没有任何
  "GAME" 相关的角色分支，PROFIT / EXPENSES 角色下不管挂的是什么类型的账户，都走同一套聚合逻辑。
- **Net Profit = Profit − Expenses**（[dashboardKpi.js:258](frontend/src/pages/dashboard/lib/dashboardKpi.js:258)），
  确认无误。
- **Earnings = NetProfit × 分成乘数**（乘数算法见第 3.2 节）。

### 4.2 Ownership 页面「Account Ownership」→ 三种典型配置，对 Earnings 卡的影响

Ownership 页面的 "Account Ownership" tab，本质是往 `company_ownership` 表写行，
`batch_save_owners_api.php` 按 `account_id` 前缀分流（[batch_save_owners_api.php:193](api/ownership/batch_save_owners_api.php:193)）：
`G_xxx` → `owner_type='group'`（挂集团）；其余（真实账户）→ `owner_type='owner'/'user'/'account'`。

**Dashboard 后端永远是"当前登录者查自己那一行"**
（[dashboard_api.php:1448](api/transactions/dashboard_api.php:1448)：
`WHERE company_id=? AND account_id=? AND owner_type=?`，`account_id`/`owner_type` 用的是
*当前登录账户自己*），所以不同配置下，"谁登录看到多少"完全取决于查到的是哪一行：

| 配置（Account Ownership 页面） | 写入 `company_ownership` | 谁登录看 Dashboard 会得到什么 |
|---|---|---|
| **单一真账户 100%**（如 `K (BOSS) - Main` 100%） | 1 行：`owner_type='owner', account_id=K, percentage=100` | **K** 登录：查到自己这行 `ownership_percentage=100` → 直接持股优先、跳过集团链路 → **Earnings = NetProfit × 100% = 全额**（例：NetProfit 3000 → K 看到 3000）。其他人没有行 → 查不到 → 不显示 Earnings 卡。 |
| **多个真账户拆分**（如 `K(BOSS) 90%` + `JK(JK) 10%`） | 2 行，各自 `percentage` 不同 | **K** 登录：只查到 K 自己那行 90% → Earnings = 3000×90% = **2700**。**JK** 登录：只查到 JK 自己那行 10% → Earnings = 3000×10% = **300**。两人互相看不到对方的份额，也不会显示对方的百分比或加总——各自的 Dashboard 只反映自己那一行。总和碰巧等于 NetProfit（因为 Total Allocation 校验加起来 = 100%），但这是配置上凑出来的，不是系统自动合计。 |
| **挂 Group（如 `Group: AP` 100%）** | 1 行：`owner_type='group', account_id=0, partner_group_id='AP', percentage=100` | 这行本身**不对应任何能登录的具体账户**，只代表"C168 利润池 100% 划给 AP 集团"（`group_equity_percentage=100`）。要看到具体账户能拿多少，还要看 **Group Earnings** tab 里 AP 集团下该账户配的 `group_account_percentage`（第二段乘法，见第 3.2 节第 4 条），例如 AP 下 X 账户配 60% → X 登录看到 Earnings = 3000×100%×60% = 1800。 |

**要点**：真账户（非 Group）配置下没有"二次分配"这一层——**account_id 直接对应登录账户本人**，
查到的百分比就是该账户 Dashboard Earnings 卡的最终乘数，公式就是单纯的
`Earnings = NetProfit × 该账户在 company_ownership 里自己那一行的 percentage`。
只有走 `Group: xxx` 这条路径时，才会多出"集团池子 → 集团内部再分"的两段乘法。

此外，`read_only` 列（截图里 JK 那行的 "Read Only" 开关）只影响该账户在系统里的编辑权限
（对应 `api/includes/partnership_audit_readonly.php`），**跟 Earnings 百分比计算无关**。

## 5. "Company: All"（同 Group 下多公司合并显示）怎么算

`frontend/src/utils/dashboard/dashboardMerge.js` 的 `mergeGroupData()`
（[dashboardMerge.js:93](frontend/src/utils/dashboard/dashboardMerge.js:93)）负责这个合并，
逻辑很直白——**先按当前选中的 Currency，把该 Group（或 All Groups）下每家公司各自的
`period_total.profit` / `period_total.expenses` 分别加总，最后统一相减一次**：

```js
dataList.forEach((d) => {
  periodProfit   += parseFloat(d.period_total.profit   || 0);
  periodExpenses += parseFloat(d.period_total.expenses || 0);
});
// 之后跟单公司视图一样丢进 computeKpiMetrics()：
netProfit = periodProfit + (periodExpenses > 0 ? -periodExpenses : periodExpenses);
```

即：`NetProfit(All) = ΣProfit(各公司) − ΣExpenses(各公司)`，是"先分别加总两条线、
最后减一次"，不是"每家公司先各自算出 NetProfit 再加总"（数学结果一致，只是实现顺序不同）。
且这个合并是**按 Currency 分开做的**，不会跨币种直接相加；跨币种合并成一个数是另一条走
FX 汇率转换的路径（Trend Chart 旁边那个 "Includes multi-currency conversion" 面板）。

## 6. Group 自己的 Dashboard（选中 Group 本身作为 scope）怎么展示

这是和第 5 节不同的场景——不是"把子公司数据合并展示"，而是**站在 Group 这个实体自己的
Dashboard 视角**。Group 除了名下挂的子公司之外，它自己也是一个能记账的实体（比如集团层面
的域名费等杂项支出，直接挂在 Group 自己账本上，跟任何子公司无关）。

### 6.1 Profit 卡片：子公司 NetProfit 无条件全额加总
```
Group Profit = Σ 每家子公司自己的 NetProfit（子公司自己的 Profit − Expenses）
```
对应 `dashboardComputeSubsidiaryEarningsTotal()`（[dashboard_api.php:1656](api/transactions/dashboard_api.php:1656)）
里的 `company_earning` 字段（[dashboard_api.php:1745](api/transactions/dashboard_api.php:1745)）——
**这里是无条件加总的，不会先按"子公司在 Ownership 页面分给这个 Group 多少 %"打折扣**。
也就是说不管 C168 分给 AP 是 100% 还是 30%，Group Profit 卡片上看到的都是 C168 的 NetProfit
全额，不会因为只分 30% 就只算 30% 进来。前端对应
`computeGroupAggregateProfit()` = `sumSubsidiaryCompanyEarnings()`（[dashboardKpi.js:85](frontend/src/pages/dashboard/lib/dashboardKpi.js:85)）。

### 6.2 Expenses 卡片：只算 Group 自己账本的支出
```
Group Expenses = Group 自己账本这期间的支出（跟子公司无关）
```
子公司自己的 Expenses 已经在算它自己 NetProfit 时扣过一次了，这里不会重复扣。

### 6.3 Net Profit：两块相加
```
Group NetProfit = (Σ 子公司 NetProfit) + Group 自己的 Expenses（负数）
```
对应 `computeGroupAggregateNetProfit()`（[dashboardKpi.js:112](frontend/src/pages/dashboard/lib/dashboardKpi.js:112)）。

### 6.4 Earnings 卡片：这里才真正套用"分成 %"
```
Group Earnings = Group NetProfit × 我在这个 Group 里自己的分成%（Group Earnings tab 配置）
```
对应 `computeGroupAggregateEarningsAmount()`（[dashboardKpi.js:120](frontend/src/pages/dashboard/lib/dashboardKpi.js:120)），
乘的是 `group_account_percentage`（"我在集团里能分到多少"），**不是**子公司给这个 Group 的
股权 %（`group_equity_percentage`）。

### 6.5 例子
Group AP 下有 C168（本期 NetProfit 3000）、X（本期 NetProfit 1000）；Group AP 自己账本这期
有 -200 支出（比如域名费）；我在 Group Earnings tab 里给自己配了 90%：

| 卡片 | 数值 | 算法 |
|---|---|---|
| Profit | 4000 | 3000 + 1000（子公司全额加总，不看股权%） |
| Expenses | -200 | Group 自己账本的支出 |
| Net Profit | 3800 | 4000 − 200 |
| Earnings | 3420 | 3800 × 90%（这里才乘我自己的分成%） |

### 6.6 容易踩的认知坑
Profit / Net Profit 这三张卡是"**假设 Group 拥有旗下每家子公司 100% 利润**"的
集团整体规模展示，并没有套用每家子公司在 Ownership 页面配的股权百分比；
**只有 Earnings 那张卡**才真正体现"我实际能分到的钱"。所以会出现 Profit/NetProfit
数字很大、但 Earnings 小很多的反差——这不是算错了，是两组卡片代表的含义本来就不同：
前三张答的是"这个集团整体盘子多大"，第四张答的是"我自己能拿多少"。

## 7. 一句话总结

- **金额抓取**：靠 `datacapture/paste/core` 下一批 `xxxPasteHelper.js`，用"关键字判定
  来源 + 正则识别金额 + 处理各种复制错位/转置" 的方式，把网页表格粘贴解析成结构化矩阵写入
  数据录入表；对应的 `.test.js` 专门测这些畸形粘贴样本的解析正确性。
- **Dashboard 金额来源**：不是直接读 Data Capture 表，而是这些录入最终落到
  `transactions`（及 `transaction_entry`）表；后端**先按 `account.role` 筛出
  PROFIT / EXPENSES 各自名下的账户 ID，再只对这批账户的交易求和**——
  Profit 卡片 = PROFIT 角色账户交易额总和，Expenses 卡片 = EXPENSES 角色账户交易额总和
  （用的是各自独立的聚合函数，EXPENSES 那套特意对齐 search_api / Transaction List 口径）。
- **例外**：`CLEAR` 类型交易在 Transaction List 正常显示（计入 Cr/Dr 列），但
  PROFIT / EXPENSES 角色的 KPI 计算会专门排除 CLEAR（`dashboardShouldExcludeClearForRole`），
  所以某期如果 Cr/Dr 几乎全是 CLEAR，Dashboard Profit 会"看起来"只等于 Win/Loss 那列，
  其实是 `Win/Loss + 非CLEAR的Cr/Dr(≈0)`，公式没变，只是这期数据构成如此。
- **Ownership 算法**：后端按"直接持股优先，其次集团链路（公司在集团股权% × 我在集团分成%），
  历史月份查 history 快照表"的规则读出比例；前端再按"group聚合 > link乘数 > 直接持股 >
  集团两段乘"的优先级把比例转成一个乘数，乘在 netProfit 上得到 Earnings。
- **Earnings 卡的显隐**：不是按 session role 硬编码，而是"当前登录账户本人是否被分配了
  ownership 配置"。
- **真账户持股（非 Group）**：每个账户只查、只看得到 `company_ownership` 里**自己那一行**的
  百分比，`Earnings = NetProfit × 自己那行的 percentage`，不会看到别人的份额、也不会自动合计。
- **挂 Group 持股**：只是把利润池划给集团，集团内部还要靠 Group Earnings tab 的
  `group_account_percentage` 做第二次分配，`Earnings = NetProfit × group_equity% × group_account%`。
- **Company: All（多公司合并）**：按 Currency 把各公司的 Profit/Expenses 分别加总，
  最后统一相减一次得到 NetProfit（`ΣProfit − ΣExpenses`），不跨币种自动合并。
- **Group 自己的 Dashboard**：Profit/NetProfit 卡片 = 旗下子公司 NetProfit **无条件全额**
  加总 + Group 自己账本的 Expenses，**不套用**子公司分给 Group 的股权%；只有第 4 张
  Earnings 卡才会乘上"我在这个 Group 里自己的分成%"，是唯一体现"我真正能拿多少"的数字。

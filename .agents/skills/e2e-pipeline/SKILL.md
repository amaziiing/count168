---
name: e2e-pipeline
description: >
  Runs the post-change verify loop: map related SPA routes, Playwright MCP smoke
  the pages, Codex-style review, list bugs for user confirm, then fix and retest.
  Use when the user says 流水线, e2e-pipeline, 改完测修, Playwright 测完再修,
  自动测试再 review, or asks to verify UI after coding with Playwright then fix.
---

# E2E Pipeline（改 → Playwright 测 → Review → 确认后修）

本仓库闭环。Review 用当前 Agent（对照 diff + Playwright 结果）。

默认约定（用户未另说时）：

- 范围：只测 **本次改动相关页面**（不是全站）
- 修复：先输出 Bug 清单，**等用户回复「确认」** 再改代码
- 工具：项目 MCP `playwright`

## 步骤

### 1. 圈定路由

1. `git diff --name-only`（含未暂存）看改动文件。
2. 把 `frontend/src/pages/{domain}/`、相关 `pageRoutes` / CSS / hooks 映射到 `pageKey`。
3. 用 `frontend/src/utils/routing/pageRoutes.js` 的 `spaPath(pageKey)` 拼路径（勿手写漏 UUID）。
4. 基址默认 **`https://count168.site`（live）**。仅当用户明确说 localhost / Vite / 本机时，才用 `http://127.0.0.1:5173`。也可读 `.cursor/state/e2e-pipeline.origin`（单行 origin，无尾斜杠）。
5. **Live 注意**：Playwright 测的是**已部署到 count168.site 的版本**。本地未 deploy 的改动线上看不到——若 diff 尚未上线，在清单里标明「本地有改动、live 未验证到新代码」，不要假装测过本地改动。
6. 输出「将测路由」列表。若无法映射：问用户要测哪几个 pageKey，不要瞎点全站。

完成标准：至少 1 条可打开的完整 URL，或已向用户问清范围。

### 2. Playwright 冒烟

1. 打开 live（或用户指定的 origin）；打不开则记录网络/证书错误，不要假装测过。
2. 用 Playwright MCP：`browser_navigate` → `browser_snapshot`（必要时 `browser_click` / `browser_fill_form`）。
3. 每条路由记录：加载是否成功、控制台/明显 UI 错误、与改动相关的关键交互是否可用。
4. 登录墙：停在登录页就记录「需登录态」，不要猜密码硬闯；可测的匿名/已登录路径继续。用户若提供测试账号，仅用于本次会话，勿写入仓库。
5. 金额/租户/权限相关改动：在清单里标红线风险，即使 UI 看起来正常。

完成标准：每条目标路由都有「通过 / 失败 / 受阻」结果。

详细工具顺序见 [reference.md](reference.md)。

### 3. Review

在 Playwright 结果之上做一轮审查：

- 对照 `git diff`：逻辑回归、空数据、重复提交、多租户 scope、金额精度、`Asia/Kuala_Lumpur`
- 对照本仓库编排红线（`.cursor/rules/00-orchestrator.mdc`）

完成标准：有书面「发现」列表（可与 Playwright 失败合并）。

### 4. Bug 清单（停步）

输出后 **停止改代码**，等用户「确认」或调整项：

```markdown
## E2E 结果
**测了**：…
**环境**：origin / 是否已登录

### Bug 清单
1. [严重|中|低] 标题
   - 复现：…
   - 期望：… / 实际：…
   - 建议：…

### 无问题则写
- 未发现阻塞问题（仍列出残留风险）
```

完成标准：清单已发出且未擅自进入修复（除非用户本轮已写明「直接修」）。

### 5. 确认后修复 + 回归

仅在用户确认后：

1. 最小改动修清单项。
2. 再跑一遍受影响路由的 Playwright。
3. 若改了 `frontend/**`：`cd frontend && npm run build` 必须绿。
4. 若改了 PHP：对改动文件 `php -l`。
5. 输出 PR 简报风格短摘要（改动文件、测了什么、还有什么没测）。

完成标准：确认项已处理或标明无法复现/需人工；验证命令已跑。

## 自动触发（可选）

若存在文件 `.cursor/state/e2e-pipeline.auto`，Agent 在**完成一批代码修改**后应提醒用户：下一轮可说「跑流水线」，或依赖 `stop` hook 自动注入跟进消息（见 `.cursor/hooks.json`）。  
**不要**在 Review/清单停步阶段再改业务代码。

## 反模式

- 未映射路由就全站乱点
- 清单未确认就大范围重构
- 登录失败仍声称「全部通过」

# E2E Pipeline — Playwright 参考

## MCP

使用 Cursor 已配置的 **playwright** MCP（项目 `.cursor/mcp.json`）。常见工具：

| 工具 | 用途 |
|------|------|
| `browser_navigate` | 打开 URL |
| `browser_snapshot` | 可访问性树 / 页面结构 |
| `browser_take_screenshot` | 视觉证据 |
| `browser_click` / `browser_type` / `browser_fill_form` | 交互 |
| `browser_console_messages` | 控制台错误 |
| `browser_network_requests` | 失败请求 |

先 `GetMcpTools` / 确认 schema，再调用。

## URL

- **默认 live origin**：`https://count168.site`
- 覆盖：用户口头指定，或 `.cursor/state/e2e-pipeline.origin` 单行（无尾斜杠）
- 本机 Vite（仅用户明确要求时）：`http://127.0.0.1:5173`
- 路径：`spaPath(pageKey)` → `/{path}/{uuid}`，定义在 `frontend/src/utils/routing/pageRoutes.js`（live 与本地 SPA 路由相同；静态资源在 live 走 `/frontend/dist/`）

示例：

- login → `https://count168.site/login/05659e0a-5121-427b-b5f2-7bbc43e14b23`
- dashboard → `https://count168.site/dashboard/f758d9be-bed3-4576-87c0-7c4c39331b87`

## 改动 → 页面启发式

| 路径片段 | 常见 pageKey |
|----------|----------------|
| `pages/dashboard` | `dashboard` |
| `pages/datacapture` | `datacapture`, `datacapturesummary` |
| `pages/transaction` | `transaction`, `transaction-payment-history` |
| `pages/account` | `account-list`, `add-account` |
| `c168_mobile/frontend/src` | mobile dashboard / transaction 等（基址同上，路径以 mobile 路由为准） |
| `public/css/{name}.css` | 同名业务页 |

不确定就 Grep `spaPath(` / 路由表，不要猜。

## stop hook 跟进文案（固定）

Hook 注入时应等价于：

```text
按 e2e-pipeline skill 执行：圈定本次改动相关路由 → 对 https://count168.site 用 Playwright MCP 冒烟 → Review → 输出 Bug 清单后停步等我确认再修。Live 测的是已部署版本。
```

## 启用 / 关闭自动跟进

```powershell
# 启用：改完后 stop hook 可自动跟进一轮流水线
New-Item -ItemType Directory -Force -Path .cursor\state | Out-Null
New-Item -ItemType File -Force -Path .cursor\state\e2e-pipeline.auto

# 关闭
Remove-Item -Force .cursor\state\e2e-pipeline.auto -ErrorAction SilentlyContinue
```

Windows 上若 hook 的 `followup_message` 未生效（已知类问题），手动发送：`跑流水线` 或 `@e2e-pipeline`。

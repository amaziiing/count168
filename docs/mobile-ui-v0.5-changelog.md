# Mobile UI Changelog — v0.5

日期：2026-09-04
范围：`c168_mobile/frontend`（26 个文件，+670 / −892 行）

## 概述

本轮为手机版做了一轮全面的 UI/UX 优化：移除开发预览框架、简化交易列表页、统一卡片设计语言、
全站"点卡片直进编辑"交互、返回/回顶浮标，以及 Bank Process 页重构。

## 1. 开发预览框架移除

- 删除 `DevPhoneFrame` 组件及样式（`components/dev/` 整个目录），开发模式下页面直接全屏渲染
- `main.jsx` 不再用模拟框包裹应用

## 2. 交易列表页（Transaction）

- **大 TOTAL 汇总卡移除**（B/F、Win/Loss、Cr/Dr、Balance 四行卡）；表格内的 TOTAL 行保留
- **`CURRENCY: MYR · 162` 标签移除**，相关 props/样式清理
- **过滤 chips 重设计**：白底描边胶囊 + 前置状态圆点，开启态品牌蓝渐变 + 对勾（`aria-pressed`）
- **回顶按钮**：滚动 >240px 后出现在 + 按键上方（`MobileShell`），中心对齐、白色圆钮品牌蓝箭头
- **账号名称换行**：ACC 列 `overflow-wrap: anywhere` 完整展示长名称，不再省略号截断

## 3. 全站共享改动

- **`m-filter-bar-action`（蓝色漏斗小方块）全站移除**：Dashboard / Maintenance / Transaction
- **"SWITCH" 提示文字移除**：Dashboard 筛选栏、Maintenance 共享筛选栏（点击切换功能不变）
- **子页面头部返回键加大**：32px → 44px 标准触控尺寸
- **滚动后左下角 "← Back" 浮标**（More 栈子页面）：滚动 >240px 出现，点击返回上一页；
  直接输入网址进入时兜底跳回 `/more`；右下角与回顶/+ 按键对称，拇指易够
- **app bar 左侧插槽**（`appBarLeftAction` / `leftAction`）：通用左侧动作位

## 4. Account 页

- **卡片简化**：移除 Payment Alert 开关行、ACTIVE 徽章、头像、重复名称
- **点卡片直进编辑**：跳过详情预览，直接打开 Edit Account 表单
- **Link Account / Delete 搬进编辑表单 footer**（原在详情页；Delete 仅 inactive + 有权限时显示）
- **卡片视觉统一**：与 User 页共用 `.m-user-card` 样式——白卡柔影、中性灰圆标、
  `ID + 名称` 首行、`角色 · Last Login` 次行，56px 统一高度

## 5. User Management 页（/more/users）

- **同样简化**：移除头像/ACTIVE 徽章/操作行，OWNER 并入信息行
- **点卡片直进 Edit User 表单**
- **Status 下拉**加入表单（saveUser 本就提交该字段；按 `canToggleStatus` 权限禁用）
- **Delete 按钮加入表单 footer**（仅可删且已停用的账号）
- 详情弹窗 `UserDetailSheet` / `AccountDetailSheet` 不再被引用（组件保留，便于恢复）

## 6. Bank Process 页（/maintenance/bank-process）

- **Accounting Due 移到 app bar 左侧**（contra inbox 同款位置），数量红色角标（9+ 封顶）
- **"SWITCH" 移除**（Maintenance 共享筛选栏）
- **卡片重设计**：无边框白卡柔影；公司名为主标题；`BS005 · OCBC (BUSINESS) · SGD ·
  2 MONTHS · 日期` 合并为一行 11px 灰阶信息；状态徽章去大写降噪；
  COST/PRICE/PROFIT 与资料区之间加发丝线，标签自然大小写
- **点卡片直进 "Edit process" 表单**（原操作菜单弹窗下线），原弹窗功能全部移入表单：
  - Status 胶囊区块（点击即时生效）
  - footer Resend 按钮（按 `canShowBankResend` 条件显示）
  - footer 下方红色 Delete 按钮（原权限规则 + 确认弹窗）
  - Remark 由表单 Notes 区随 Save 保存（独立备注小弹窗下线）

## 7. 新增文档

- 本文件：`docs/mobile-ui-v0.5-changelog.md`

## 验证说明

- Vite HMR 全程无编译错误
- 主要交互（卡片点击、浮标出现/消失、表单打开）在开发环境通过 DOM 断言验证
- 建议合并前在真机过一遍：Transaction 回顶/back 浮标手感、Bank Process 编辑表单保存、
  Account/User 编辑保存与删除

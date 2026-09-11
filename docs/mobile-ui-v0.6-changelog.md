# Mobile UI Changelog — v0.6

日期：2026-09-05
范围：`c168_mobile/frontend`

## 概述

本轮以顶栏与全站体验为主：App Bar 重构（铃铛+logo 左移、主题/语言切换入栏）、
全站即时中英切换、通知红点未读逻辑、手机版 Bank Process 整体下线、维护区重构
（Maintenance Centre 移除、Payment Maintenance 直提）、Payment Maintenance 筛选栏
对齐 dashboard/transaction、Account 角色色恢复、Admin 表单脏检查等。

## 1. App Bar 重构

- 布局：左 = 铃铛 + logo；右 = 日夜切换 · 语言切换 · │ 发丝线 · 齿轮（More）
- logo 放大至 36px 高（与 44px 铃铛视觉相当），点击刷新保留；≤420px 自动限宽防溢出
- 日夜切换：深色模式显示内联 SVG 线条太阳（实心圆心 + 8 直线光芒，替代 FA fa-sun
  的锯齿齿轮观感），浅色模式 FA 月亮；与 Settings 页通过 `THEME_UPDATED_EVENT` 双向同步
- 语言切换：毛玻璃胶囊滑块「EN | 中」（白色滑块 0.28s 弹性曲线滑动），与登录页
  iOS 开关同一设计语言；显示当前语言（滑块位置），点击即切

## 2. 全站即时中英切换

- `loginLang.js` 新增 `useSyncedLoginLang()`：基于 `LANGUAGE_UPDATED_EVENT` 的 React 绑定
- Dashboard / Transaction / Account / More / Report / Maintenance / Admin / Member /
  AutoRenew / Ownership / Stub / SecondaryPassword 等 16+ 消费方全部接入
- 顶栏、Settings、登录页任一处切换语言，**当前页面文字立即切换**，无需刷新或重进

## 3. 通知红点（未读逻辑）

- 红点数字从「公告总数」改为「未读公告数」；已读集合存模块级内存
- 每次刷新/重新登录红点重现（今天要求的行为）；打开通知面板即全部标记已读，
  红点消失且本次页面会话内不复活；新公告到达后重新出现

## 4. Account 页

- Currency setting 齿轮入口及弹层引用移除（`CurrencySettingSheet` 组件暂留未引用）
- 卡片恢复 role 粉彩底色（与 Transaction 共用 `styles/account-roles.css`），文字对比度达标

## 5. 手机版 Bank Process 下线

- 移除：More 入口卡片、路由 `/maintenance/bank-process` 与 `/maintenance/bankprocess`、
  `pages/bankprocess/` 整目录、`MaintenanceBankprocessPage`、`lib/bankProcessApi.js`、
  `canAccessBankProcess` / `canAccessBankprocessMaintenance` 权限函数、孤儿 i18n 键
- 保留：桌面版完全不动；realtime 桥的 `bankprocess_delete` 监听（桌面删除时手机端
  余额仍实时刷新）；支付维护页对存量数据的描述前缀处理

## 6. 维护区重构

- **Maintenance Centre 中枢移除**，`/maintenance` 路由删除
- **Transaction Maintenance 移除**（属桌面版 Data Capture 审计）
- **Payment Maintenance 直提进 More**（`fa-wallet` 卡片，仅完整维护权限可见），
  返回键直回 `/more`；`/maintenance/payment` 路由保留
- `maintenanceApi.js` 清理孤儿函数（transaction 搜索、bankprocess 批选辅助）

## 7. Payment Maintenance 筛选栏对齐 dashboard/transaction

- 筛选栏改为 dashboard 同款 chips：**日期 chip + 范围 chip**（`m-fchip` 样式）
- 日期 chip 直接复用 dashboard 原生 `DateFilterChip`（轻量 dash 适配器接入）：
  预设侧栏 + 月历、点两下选范围即时应用关闭，无 footer 按钮
- 范围 chip 打开 `MaintenanceFilterSheet` 的 Group ID / Company 分区
  （`section="date" | "scope" | "full"` 参数化，Report 页旧单面板不受影响）
- **Transaction type 独立 chip**，与搜索框同行；展开为单选列表面板
  （整行选项 + 选中蓝勾，点击即时生效），替代药丸换行布局

## 8. Date Range 面板微调

- 预设侧栏改 auto 宽 + `nowrap`：中英文、任意系统字号都不折行（This Week 等
  曾在部分设备被系统字体放大挤成两行），日历拿剩余全部宽度

## 9. More / Admin / Settings 文案与布局

- More 副标题 → "Tools and settings / 工具与设置"（原 "Tools and reports" 已过时）
- More 卡片简介行全部移除（标题 + Open 更干净）；**User Management → Admin**（zh 管理）
- **Logout 按钮加入 More 底部**（复用 `m-more-page--settings` flex 沉底方案），
  与 Settings 页按钮同款渐变样式、直登登出
- Admin 页头部副标题、Settings 页副标题移除（`usersSubtitle` / `settingsSubtitle` 清理）

## 10. Admin 表单脏检查

- 打开表单（新建/编辑）对全部表单状态做签名基线：字段、权限集合、账号/流程选择、
  租户选择（`JSON.stringify` 签名 + state 基线）
- 关闭时**仅真实改动**才弹 "Discard unsaved changes?"——之前无条件弹出非常扰人
- 保存流程不走关闭确认；异步选项加载失败也不会误弹

## 环境备注（本机 dev，不入库）

- dev 后端由 `php -S` 换成 **XAMPP Apache**（`C:\xampp\apache\conf\extra\
  httpd-count168-dev.conf`，端口 8000 不变，Vite 代理无需改动）——
  `php -S` 在 Windows 单线程，浏览器并发请求全部排队导致 3-15 秒假延迟
- MySQL 曾因 redo log 损坏无法启动：备份 `C:\xampp\mysql\data_backup_20260905\`
  后移除 `ib_logfile0/1` 重建恢复

## 验证说明

- 以上交互均在开发环境 DOM 断言实测：语言即时切换（en↔zh 文字采样）、红点
  出现/消失/刷新复活、chips 三面板分区、日历点选即时应用（02-06 Sep 采样）、
  类型单选即时过滤（PAYMENT/RECEIVE/CONTRA 采样）、脏检查两场景（无改动不弹/
  改名后弹 confirm）、bank process 与维护区入口移除后的页面结构
- `npm run build` 通过；`dist` 已随本批更新

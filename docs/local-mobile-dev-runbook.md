# 本地手机版 (c168_mobile) 开启指南

> **⚠️ 开启前必读**:下次开启本地手机版,先完整阅读本文档,按"零、快速启动清单"顺序执行。
> 每一步都有验证命令和预期结果,不符就跳到"五、故障排查手册"。
>
> 适用目录:`C:/Users/donho/OneDrive/Desktop/count168test`
> 手机版前端位于 `c168_mobile/frontend/`(React + Vite + Tailwind v4)

## 零、快速启动清单(按顺序)

| # | 服务 | 启动方式 | 验证命令 | 预期结果 |
|---|------|---------|---------|---------|
| 1 | MySQL 3306 | XAMPP 控制面板点 MySQL 的 Start;或见下文"启动 MySQL" | `mysql -u root -e "SELECT @@innodb_buffer_pool_size/1024/1024"` | **1024**(若是 16 → 性能问题会复发,见 四之二) |
| 2 | Apache 8000 | XAMPP 控制面板点 Apache 的 Start | `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/api_response.php` | `200` |
| 3 | Vite 5174 | `cd c168_mobile/frontend && npm run dev` | `curl -o /dev/null -w "%{http_code}" http://localhost:5174/` | `200` |
| 4 | Hub 3911(可选) | `cd services/tx-realtime && node server.mjs` | `curl -o /dev/null -w "%{http_code}" http://localhost:5174/realtime/sse` | `401`(缺 ticket 属正常;`404` = 代理 rewrite 丢了) |

全部通过后,浏览器打开 **http://localhost:5174**(旧页面务必 **Ctrl+F5** 强刷)。
性能基准:登录后 dashboard 数据应在 **~1 秒内**出来;明显变慢 → 查"四之二、性能调优记录"。

> 💡 快速体检一条命令(四项全查):
> ```bash
> netstat -ano | grep -E ":(8000|5174|3911|3306)" | grep LISTEN
> ```
> 应看到 4 个 LISTENING(3306、8000、3911、5174)。

## 一、服务架构(共 4 个本地服务)

| 服务 | 地址 | 说明 |
|------|------|------|
| **MySQL 数据库** | 127.0.0.1:3306 | XAMPP 的 MariaDB,库 `u857194726_c168site` |
| **Apache PHP 后端** | http://127.0.0.1:8000 | API 接口,Vite 把 `/api`、`/images`、`/js` 代理过去 |
| **Vite 手机版前端** | http://localhost:5174 | 手机版页面入口,平时开发就开这个 |
| **实时推送 Hub (SSE)** | http://127.0.0.1:3911 | `services/tx-realtime`,交易实时刷新用(可选) |

> ⚠️ **不要再用 `php -S 127.0.0.1:8000` 当后端!** PHP 内置服务器是单线程的,
> 手机版 dashboard 一次加载会并发几十个 API 请求(bootstrap + 多币种 KPI + SSE ticket),
> 单线程下全部排队,页面数据"加载不出来/极慢"。
> 现已改用 **XAMPP Apache 虚拟主机(150 工作线程)** 服务 8000 端口。
> 另外 `php -S` 的进程在父终端关闭后 stdout 管道会堵塞,越跑越慢(实测 35 秒/请求)。

## 二、启动步骤详解

### 1. 启动 MySQL(端口 3306)—— 必须第一个启动

**注意:MySQL 不是 Windows 服务**,重启电脑后不会自动运行!

```bash
# 方式 A(推荐):XAMPP 控制面板点 MySQL 的 Start
# 方式 B:命令行
cd /c/xampp && mysql/bin/mysqld.exe --defaults-file=mysql/bin/my.ini --standalone
```

验证(缓冲池必须是 1024,这是性能的关键,见"四之二"):
```bash
/c/xampp/mysql/bin/mysql.exe -u root -e "SELECT @@innodb_buffer_pool_size/1024/1024 AS pool_mb;"
# 预期:1024.00000000  ← 若是 16,说明 my.ini 第144行的 innodb_buffer_pool_size=1G 被改动
```

### 2. 启动 Apache PHP 后端(端口 8000)

配置已就位(一次性,无需重做):
- `C:/xampp/apache/conf/extra/httpd-count168-dev.conf` — 虚拟主机定义,
  `DocumentRoot` 指向本项目根目录,`Listen 8000`
- `C:/xampp/apache/conf/httpd.conf` 末尾已 `Include` 该文件

```bash
# 方式 A(推荐):XAMPP 控制面板点 Apache 的 Start
# 方式 B:命令行
cd /c/xampp/apache/bin && httpd.exe    # 或用 xampp 的 apache_start.bat
```

验证:`curl -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/api_response.php`
→ `200`(根路径 404 属正常,项目根没有 index 文件)。

### 3. 启动 Vite 手机版前端(端口 5174)

```bash
cd C:/Users/donho/OneDrive/Desktop/count168test/c168_mobile/frontend
npm run dev
```

浏览器打开 **http://localhost:5174**。

> Vite 会监视 `vite.config.js`,改动代理配置会自动重启 dev server。
> `/realtime` 代理必须带 `rewrite: path => path.replace(/^\/realtime/, "")`
> (生产 nginx 会剥掉 `/realtime` 前缀,hub 只认 `/sse`、`/health`、`/publish`;
> 不重写的话 SSE 一直 404,实时刷新静默失效)。

### 4. (可选) 启动实时推送 Hub(端口 3911)

```bash
cd C:/Users/donho/OneDrive/Desktop/count168test/services/tx-realtime
node server.mjs
```

验证:`curl http://127.0.0.1:3911/health` → 200;经 Vite 验证 SSE 路由:
`curl -o /dev/null -w "%{http_code}" http://localhost:5174/realtime/sse` → **401**(缺 ticket,属正常)。

## 三、停止服务

```bash
netstat -ano | grep -E ":(8000|5174|3911|3306)" | grep LISTEN
taskkill //PID <上面查到的PID> //F
```
> MySQL 正确停法:`/c/xampp/mysql/bin/mysqladmin.exe -u root shutdown`

## 四、运行状态(2026-09-07 09:51 检查)

| 服务 | 状态 | 验证 |
|------|------|------|
| MySQL 3306 | ✅ 运行中 | 缓冲池 1G,dashboard 接口 ~300ms |
| Apache 8000 (httpd.exe) | ✅ 运行中 | API 全部 200 |
| Vite 5174 | ✅ 运行中 | SSE 连接正常 |
| Hub 3911 | ✅ 运行中 | /health 200 |

## 四之二、⚠️ 性能调优记录(2026-09-07 审核结论)

### 根因:XAMPP MySQL 默认 `innodb_buffer_pool_size=16M`

**现象**:手机版 dashboard 加载 3~13 秒(接口 200 但极慢)。

**排查路径**(可直接复用的方法论):
1. Apache access log 看状态码 → 全 200,排除鉴权/报错
2. PHP 探针脚本分段计时(session / PDO / include / endpoint)→ 3.3s 全在 endpoint 执行
3. MySQL 慢日志(`SET GLOBAL long_query_time=0` 抓全部)→ 3 条
   `data_capture_details` 期初余额聚合占 2.65s,每条扫描 3~4 万行
4. 去掉 CONVERT/COLLATE 对比测试 → 无改善,排除索引/排序规则问题
5. `SHOW VARIABLES LIKE 'innodb_buffer_pool_size'` → **16M**(工作集 100MB+,页池抖动反复读盘)

**修复**(已写入 my.ini,重启 MySQL 后生效):
```ini
# C:/xampp/mysql/bin/my.ini 第 144 行
innodb_buffer_pool_size=1G   # 原 16M;机器 24G 内存,充裕
```

**效果**:重查询 0.9~1.6s → 0.14s;完整 bootstrap 接口 3300ms → 300ms(约 10 倍)。

### 性能排查工具箱
- 探针脚本:伪造 `$_SESSION['user_id']` + 分段 microtime 计时 require 各阶段
- 慢日志:`SET GLOBAL slow_query_log_file=...; SET GLOBAL long_query_time=0; SET GLOBAL slow_query_log='ON'`
  (用完务必 OFF 并删除日志文件,否则磁盘会被写满)
- general log:看每请求查询数/间隔(秒级精度,间隔只能作参考)

## 五、故障排查手册(实战记录)

### 症状 1:页面数据一直加载不出来/极慢

**排查顺序:**

1. **确认 8000 是谁在监听**:
   ```bash
   netstat -ano | grep ":8000" | grep LISTEN
   wmic process where "ProcessId=<PID>" get CommandLine
   ```
   - `php.exe -S ...` → 单线程瓶颈,杀掉改用 Apache(见第二节)
   - `httpd.exe` → 正确

2. **测基础响应速度**:
   ```bash
   curl -o /dev/null -w "%{time_total}s\n" http://127.0.0.1:8000/api/api_response.php
   ```
   > 20 秒以上且进程是 `php.exe -S`:多半是它的父终端已关闭、stdout 管道堵塞
   > (每写一条访问日志就卡)。杀掉重启即可。
   > 注意:即使看到"静态文件也要 19 秒",也先怀疑是排队,不一定是文件系统慢。

3. **看 Apache access log**(`/c/xampp/apache/logs/access.log`):
   浏览器请求是否 200、是否有 401(登录失效)/403/500。

4. **确认 MySQL 缓冲池**:`SELECT @@innodb_buffer_pool_size` → 必须 1073741824(1G)。
   若是 16M → 数据接口会慢 10 倍,修 my.ini 后重启 MySQL(见"四之二")。

### 症状 2:数据能加载但"不实时"

检查 SSE 链路(浏览器 → Vite 5174 → hub 3911):
```bash
curl -o /dev/null -w "%{http_code}" http://localhost:5174/realtime/health   # 应 200
curl -o /dev/null -w "%{http_code}" http://localhost:5174/realtime/sse      # 应 401
netstat -ano | grep ":3911" | grep ESTABLISHED                              # 应有一条
```
404 = Vite 的 `/realtime` 代理缺 `rewrite`(见第二节)。

### 常见坑

- **MySQL 重启电脑后没自启**:它不是 Windows 服务,每次开机要手动启动(见"二.1")。
- **`php: command not found`**:PHP 在 `C:/xampp/php/php.exe`,不在 PATH。
- **5174 被占用**:Vite 是 `strictPort: true`,先 `taskkill` 旧进程。
- **数据库**:`includes/config.php` 默认连本机 `u857194726_c168site`(用户 `admin`);
  覆盖配置用 `includes/config.local.php`。
- **别同时开两个 8000**:php -S 和 Apache 都抢 8000,后起的起不来或行为混乱。
- **浏览器旧页面假死**:修复服务后务必 Ctrl+F5 强刷,别相信停留在错误重试循环里的旧页面。

## 相关文档
- 手机版 UI 变更记录:`docs/mobile-ui-v0.6-changelog.md` 等
- 域名/流程逻辑:`docs/domain-flow-manual.md`、`docs/transaction-rate-manual-logic.md`
- MCP/工具配置:`docs/mcp-setup.md`

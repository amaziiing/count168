# count168.org — Transaction Payment 实时同步（SSE）

一边 Submit（APPROVED）后，其他开着 Transaction Payment 的浏览器经 SSE 收到 `ledger_changed`，静默重搜（约 1s）。`PENDING` 不广播。

**与 count168.site 隔离**：org 用 **端口 3912** + **`tx-realtime-org.service`**；site 若启用则用 3911 + `tx-realtime.service`。同机可并存，互不影响。

## 组件

| 组件 | 路径 |
|------|------|
| Node SSE hub | `services/tx-realtime/server.mjs` |
| PHP publish | `api/includes/ledger_realtime.php` |
| Ticket API | `api/transactions/realtime_ticket_api.php` |
| 前端订阅 | `frontend/src/pages/transaction/lib/transactionRealtime.js` |
| systemd（org） | `deploy/systemd/tx-realtime-org.service` |
| Nginx snippet | `deploy/nginx/realtime-location-org.inc` → `/etc/nginx/snippets/c168-realtime-org-locations.inc` |
| 部署脚本 | `deploy/deploy-realtime-org.sh` |

单机 EC2 可不装 Redis（进程内 fanout）。多实例 org 节点时再设 `REDIS_URL`。

## EC2 部署（org）

代码已在 `/var/www/count168.org` 后：

```bash
bash /var/www/count168.org/deploy/deploy-realtime-org.sh
curl -s http://127.0.0.1:3912/health
curl -sI https://count168.org/realtime/health | head
```

脚本只会：

- 写 `/var/www/count168.org/services/tx-realtime/.env`
- 更新 `/var/www/count168.org/includes/config.local.php` 的 `$tx_realtime_secret` / `$tx_realtime_publish_url`
- 安装 **`tx-realtime-org`** systemd
- 在 **`count168.org*.conf`** 注入 `/realtime/` 反代（**不**改 `count168.site*.conf`）

### 手动覆盖端口

```bash
TX_REALTIME_PORT=3912 APP_ROOT=/var/www/count168.org bash deploy/deploy-realtime-org.sh
```

### config.local.php（示例）

```php
$tx_realtime_secret = '…';  // 与 services/tx-realtime/.env 一致
$tx_realtime_publish_url = 'http://127.0.0.1:3912/publish';
```

secret 为空时 realtime **自动关闭**（Submit 不受影响）。

**权限**：php-fpm 用户为 `apache`。`config.local.php` 需 `ec2-user:apache` + `640`，否则 ticket 一直 `enabled:false`。

```bash
sudo chown ec2-user:apache /var/www/count168.org/includes/config.local.php
sudo chmod 640 /var/www/count168.org/includes/config.local.php
```

## 本地开发（org 库）

```bash
cd services/tx-realtime
cp .env.example .env   # TX_REALTIME_PORT=3912
npm install
npm run dev
```

本地 `includes/config.local.php` 设同一 secret + `http://127.0.0.1:3912/publish`。

## 验收

1. 两浏览器同公司、Capture Date 含交易日  
2. A Submit 当天 PAYMENT → B 约 1s 内表格更新  
3. `curl http://127.0.0.1:3912/health` 的 `clients` ≥ 开着 Transaction Payment 的浏览器数  
4. Nginx access log 有 `/realtime/sse`（不只 `realtime_ticket_api.php`）

## 排障

| 现象 | 检查 |
|------|------|
| ticket `enabled:false` | `config.local.php` secret 空或 apache 读不到 |
| 无 SSE 连接 | `systemctl status tx-realtime-org`、3912 端口、`/realtime/` nginx |
| Submit 正常但不刷新 | publish URL 是否 3912（不是 site 的 3911） |

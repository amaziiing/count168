# Amazon Linux 2023 (EC2) 部署 count168

> **count168.com**：请改读 [`deploy/EC2_COUNT168_COM.md`](./EC2_COUNT168_COM.md)（本文件保留给历史 `.site` / `.org` 说明）。

你的实例：**Amazon Linux 2023 ARM64**（t4g.medium），公网 IP 示例：`56.68.48.190`。

我无法直接 SSH 进你的 EC2，请用 **EC2 控制台 → 连接 → EC2 Instance Connect** 粘贴命令。

## 一、AWS 安全组（先做）

入站规则至少要有：

| 端口 | 来源 | 用途 |
|------|------|------|
| 22 | 你的 IP | SSH |
| 80 | 0.0.0.0/0 | HTTP |
| 443 | 0.0.0.0/0 | HTTPS |

## 二、DNS

| 域名 | 记录 | 指向 |
|------|------|------|
| `count168.site` / `www.count168.site` | A | EC2 **公网 IPv4**（不是私有 172.31.x.x） |
| `count168.org` / `www.count168.org` | A | 同上（与 `.site` 同机） |

## 二点五、同机 `.org` + `.site`（Nginx）

两个域名**代码目录分开**，Nginx 各一份配置：

| 域名 | 代码目录 | Nginx 模板 | 安装路径 |
|------|----------|------------|----------|
| count168.org | `/var/www/count168.org` | `deploy/nginx/count168.org.amazon-linux.conf` | `/etc/nginx/conf.d/count168.org.conf` |
| count168.site | `/var/www/count168` | `deploy/nginx/count168.site.amazon-linux.conf` | `/etc/nginx/conf.d/count168.site.conf` |

`.org` **保留 `default_server`**（整台 EC2 默认 80 站点）；`.site` **不要** `default_server`。

**`.org` 首次 clone**（若目录还没有）：

```bash
sudo dnf install -y git
sudo git clone --branch main --depth 1 https://github.com/kunzzgroups/count168test.git /var/www/count168.org
sudo chown -R ec2-user:nginx /var/www/count168.org
```

**安装 Nginx 站点**（`.site` 与 `.org` 代码都就绪后）：

```bash
sudo cp /var/www/count168.org/deploy/nginx/count168.org.amazon-linux.conf /etc/nginx/conf.d/count168.org.conf
sudo cp /var/www/count168/deploy/nginx/count168.site.amazon-linux.conf /etc/nginx/conf.d/count168.site.conf
sudo rm -f /etc/nginx/conf.d/default.conf
sudo sed -i 's/ default_server//g' /etc/nginx/conf.d/count168.site.conf
sudo nginx -t && sudo systemctl reload nginx
```

**`.org` 首次 clone 后**，与 `.site` 一样随 **push main 自动部署**。仅更新 org 时可手动跑：

```bash
bash /var/www/count168.org/deploy/deploy-org.sh
```

HTTPS（**先确保 `nginx -t` 通过**，再分别申请）：

```bash
sudo certbot --nginx -d count168.org -d www.count168.org
sudo certbot --nginx -d count168.site -d www.count168.site
```

certbot 会生成 `count168.org-le-ssl.conf` / `count168.site-le-ssl.conf`。**日常 git deploy 不会覆盖这些文件**（见 `deploy.sh`）。

更新 `.org` 路由（仅 location 变更、且未用 certbot 时）：

```bash
sudo cp /var/www/count168.org/deploy/nginx/count168.org.amazon-linux.conf /etc/nginx/conf.d/count168.org.conf
sudo nginx -t && sudo systemctl reload nginx
```

若已上 certbot，请手动合并 location 块，或先备份再 cp，失败则 `nginx -t` 会报错。

## 三、一键装环境 + Nginx（推荐）

SSH / Instance Connect 登录后：

```bash
sudo dnf install -y git
sudo git clone --branch main --depth 1 https://github.com/kunzzgroups/count168test.git /var/www/count168
cd /var/www/count168
sudo bash deploy/ec2-amazon-linux-setup.sh
```

脚本会：装 nginx / php-fpm / mariadb、去掉默认 Welcome 页、启用 `deploy/nginx/count168.site.amazon-linux.conf`。

## 四、前端 dist

**方式 A — 本机构建后上传（推荐）**

本地（必须用 `build:deploy`；普通 `npm run build` 的 postbuild 钩子会删掉新构建的哈希 bundle，部署后 index.html 引用 404 资源 → 白屏）：

```bash
cd frontend
npm run build:deploy
```

用 WinSCP / FileZilla 把 `frontend/dist/` 整个目录上传到服务器 `/var/www/count168/frontend/dist/`。

**方式 B — 在 EC2 上 build**

```bash
sudo dnf install -y nodejs npm
cd /var/www/count168/frontend
npm ci
npm run build:deploy
```

## 五、数据库

1. 编辑 `/var/www/count168/includes/config.php`（Hostinger 的库名/密码要改成 EC2 本地 MySQL）。
2. 导入数据：见 `database/HOSTINGER_IMPORT.md`。

## 六、验证

```bash
curl -I http://127.0.0.1/p/05659e0a-5121-427b-b5f2-7bbc43e14b23
ls /var/www/count168/frontend/dist/index.html
sudo systemctl status nginx php-fpm
```

浏览器：`https://count168.site/p/05659e0a-5121-427b-b5f2-7bbc43e14b23` — 应看到登录页，**不是** Welcome to nginx / 404。

**UUID 路由更新后**（git pull 含 nginx 变更）：

```bash
sudo cp /var/www/count168/deploy/nginx/count168.site.amazon-linux.conf /etc/nginx/conf.d/count168.site.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 七、HTTPS

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d count168.site -d www.count168.site
```

## 常见问题

**仍显示 Welcome to nginx**

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
sudo cp /var/www/count168/deploy/nginx/count168.site.amazon-linux.conf /etc/nginx/conf.d/count168.site.conf
sudo nginx -t && sudo systemctl reload nginx
```

**502 Bad Gateway**

```bash
ls /run/php-fpm/www.sock
sudo systemctl restart php-fpm nginx
```

**403 / 权限**

```bash
sudo chcon -R -t httpd_sys_content_t /var/www/count168
```

**API 数据库连接失败**

检查 `includes/config.php` 与 MariaDB 是否已建库、导入。

**登录弹窗 “An error occurred during login” / 接口 HTTP 500**

不是密码错，是 **PHP 连不上 MySQL**。SSH 到 EC2：

```bash
sudo systemctl status mariadb
mysql -u admin -p -h 127.0.0.1 u857194726_c168site -e "SELECT 1"
```

推荐在服务器创建 `includes/config.local.php`（已在 .gitignore，不会被 git pull 覆盖）：

```bash
sudo cp /var/www/count168/includes/config.local.php.example /var/www/count168/includes/config.local.php
sudo nano /var/www/count168/includes/config.local.php
```

填入 EC2 本地 MySQL 的 `$dbname` / `$dbuser` / `$dbpass`，保存后测试：

```bash
curl -sS -X POST https://count168.site/api/session/login_api.php \
  -F action=login -F company_id=TEST -F login_id=TEST -F password=x -F login_role=admin
```

应返回 JSON（如 `Database connection failed` 或 `Username or password is incorrect`），而不是空白的 HTTP 500。

## 日常更新（push 自动部署 site + org）

```bash
cd frontend && npm run build && cd ..   # 若改了前端
git add -A && git commit -m "说明" && git push origin main
```

push 到 **`main`** 后，GitHub Actions **Deploy to EC2** 会**并行**跑两个 job：

| Job | EC2 目录 | 域名 |
|-----|----------|------|
| `count168.site` | `/var/www/count168` | count168.site |
| `count168.org` | `/var/www/count168.org` | count168.org |

**EC2 上两个目录都要先 clone 好**（见「二点五」）。仅想单独重部署 org：Actions → **Deploy org to EC2** → Run workflow。

每次 deploy 还会自动把手机版下载页发布到站点的 `/app/`（源：仓库 `c168_mobile/app/install-page/`，脚本 `deploy/publish-app-page.sh`，APK 不进 git）——count168.site、www.count168.org 与 **www.count168.com** 都能下载电话版，详见 [`c168_mobile/app/README.md`](../c168_mobile/app/README.md#下载页install-page)。

> 三仓库（site → org → com）的合并、发布、冲突处理与电话版出包上传的完整流程，见
> [`docs/repo-sync-and-release.md`](../docs/repo-sync-and-release.md)。

### 一次性配置（GitHub → Settings → Secrets and variables → Actions）

| Secret | 值 |
|--------|-----|
| `EC2_HOST` | `56.68.48.190`（或你的 EC2 公网 IP） |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | 登录 EC2 用的 **私钥** 全文（`.pem` 文件内容） |

EC2 上需已 clone：

- `/var/www/count168`（count168.site）
- `/var/www/count168.org`（count168.org）

且两个目录都能 `git pull`（公开仓库即可；私有仓库要在 EC2 配 deploy key 或 PAT）。

手动部署（备用）：

```bash
cd /var/www/count168
bash deploy/deploy.sh
```

## 日常更新（手动 pull，无 Actions 时）

```bash
cd /var/www/count168
git pull origin main
# 若前端有改：本地 build 后只覆盖 frontend/dist/
sudo systemctl reload nginx
```

## 部署失败：`insufficient permission for adding an object to repository database .git/objects`

原因：仓库当初用 `sudo git clone` 装过，`.git` 归 **root**，`ec2-user` 和 GitHub Actions 无法 `git fetch`。

**一次性修复**（EC2 Instance Connect 粘贴）：

```bash
sudo chown -R ec2-user:nginx /var/www/count168
bash /var/www/count168/deploy/deploy.sh
grep index- /var/www/count168/frontend/dist/index.html
```

最后一行应显示当前 main 上的 hash（如 `index-Kdu-tZ13.js`），**不是**过期的 `index-pRYh52Hh.js`。

也可在 GitHub → Actions → 最新失败的 **Deploy to EC2** → **Re-run all jobs**（需先把上面 chown 跑一遍，或等 `deploy.sh` 已含自动修复并 push 后再 rerun）。

## 部署失败：Actions 一直红、但网站还能打开

说明 **SSH 连上了但脚本失败**，或 **GitHub 根本 SSH 不进 EC2**。先确认线上是否落后：

```bash
curl -sS https://count168.site/frontend/dist/index.html | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1
```

与本地 `frontend/dist/index.html` 里的 hash 对比；不一致则 EC2 未拉到最新 main。

**在 EC2 上手动跑一遍**（Instance Connect）：

```bash
sudo chown -R ec2-user:nginx /var/www/count168
df -h /var/www/count168
bash /var/www/count168/deploy/deploy.sh
```

- 若报 `git fetch` / `.git/objects`：仍是权限问题，确认 chown 成功。
- 若报 `duplicate default server`：EC2 **同机还跑着 count168.org**（或其它站点）时，**整台机器 80 端口只能有一个 `default_server`**，应留给 `.org`，`.site` 不能用。执行：
  ```bash
  sudo grep -rn default_server /etc/nginx/
  # 只改 .site，保留 .org 上的 default_server
  sudo sed -i 's/ default_server//g' /etc/nginx/conf.d/count168.site.conf
  sudo nginx -t && sudo systemctl reload nginx
  ```
  **不要**用仓库配置覆盖 `/etc/nginx/conf.d/count168.org.conf`。若需更新 `.site` 的 nginx 路由，手动合并到现有 certbot 配置，或只改 `count168.site.conf` 里非 `listen` 的 location 块。
  若误删了 `count168.site-le-ssl.conf`，用 `sudo certbot --nginx -d count168.site -d www.count168.site` 恢复 HTTPS。
- 若本地手动成功，但 Actions 仍失败：检查 GitHub Secrets 里 `EC2_HOST`（公网 IP）、`EC2_USER`（`ec2-user`）、`EC2_SSH_KEY`（完整 `.pem` 私钥，含 `BEGIN/END` 行）。Secret 被截断或改错后，从 1072 起会连续失败且网站仍显示旧版本。
- Actions 数秒失败且日志含 `set: pipefail: invalid option name`：EC2 上的 `deploy/*.sh` 被 WinSCP 写成了 **CRLF**。先 `sed -i 's/\r$//' /var/www/count168/deploy/*.sh` 再跑 `bash /var/www/count168/deploy/deploy.sh`。`winscp-deploy-ec2.ps1` 同步后会自动去 CRLF。

#!/usr/bin/env bash
# count168.com — Amazon Linux 2023 首次部署（在 EC2 上以 root 或 sudo 运行）
# 用法:
#   sudo bash deploy/ec2-amazon-linux-setup.sh
#
# 若本机已跑过 count168.site / .org 安装，可跳过 dnf 装包，只做 clone + nginx .net。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168.com}"
REPO_URL="${REPO_URL:-https://github.com/kunzzgroups/count168.git}"
BRANCH="${BRANCH:-main}"

echo "==> 1/7 安装 Nginx、PHP-FPM、MariaDB、Git（已装则跳过）"
dnf update -y
dnf install -y nginx php-fpm php-mysqlnd php-mbstring php-xml php-curl php-pdo php-pecl-apcu mariadb105-server git

echo "==> 2/7 启动 MariaDB / Nginx / PHP-FPM"
systemctl enable --now mariadb nginx php-fpm

echo "==> 3/7 PHP 上传限制"
PHP_INI="$(php -i 2>/dev/null | awk -F'=> ' '/^Loaded Configuration File/{print $2}' | tr -d ' ')"
if [[ -f "$PHP_INI" ]]; then
  sed -i 's/^post_max_size.*/post_max_size = 64M/' "$PHP_INI" || true
  sed -i 's/^upload_max_filesize.*/upload_max_filesize = 64M/' "$PHP_INI" || true
  grep -q '^post_max_size' "$PHP_INI" || echo 'post_max_size = 64M' >> "$PHP_INI"
  grep -q '^upload_max_filesize' "$PHP_INI" || echo 'upload_max_filesize = 64M' >> "$PHP_INI"
fi
systemctl restart php-fpm

echo "==> 4/7 拉取代码到 ${APP_ROOT}"
mkdir -p "$(dirname "$APP_ROOT")"
if [[ ! -d "${APP_ROOT}/.git" ]]; then
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_ROOT"
else
  echo "    已有 git 仓库，跳过 clone"
fi

echo "==> 5/7 Nginx 站点 count168.com（不设 default_server）"
rm -f /etc/nginx/conf.d/default.conf
cp "${APP_ROOT}/deploy/nginx/count168.com.amazon-linux.conf" /etc/nginx/conf.d/count168.com.conf
sed -i 's/ default_server//g' /etc/nginx/conf.d/count168.com.conf
nginx -t
systemctl reload nginx

echo "==> 6/7 目录权限 + SELinux"
chown -R ec2-user:nginx "$APP_ROOT"
find "$APP_ROOT" -type d -exec chmod 755 {} \;
find "$APP_ROOT" -type f -exec chmod 644 {} \;
if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" || true
  setsebool -P httpd_can_network_connect_db 1 || true
fi

echo "==> 7/7 检查 frontend/dist"
if [[ ! -f "${APP_ROOT}/frontend/dist/index.html" ]]; then
  echo "    警告: frontend/dist/index.html 不存在。"
  echo "    请在本地 npm run build 后上传 frontend/dist/，或在服务器安装 node 后 build。"
fi

cat <<EOF

========================================
count168.com 基础环境已装好。还需手动完成：

1) 独立数据库（不要用 count168.site 的库）
   见 deploy/EC2_COUNT168_COM.md 「独立数据库」
   或: sudo bash ${APP_ROOT}/deploy/create-com-database.sh

2) config.local.php
   sudo cp ${APP_ROOT}/includes/config.local.php.example ${APP_ROOT}/includes/config.local.php
   sudo nano ${APP_ROOT}/includes/config.local.php
   # 填 c168_net / c168_admin / 密码

3) DNS
   count168.com / www → 本机公网 IP

4) HTTPS
   sudo dnf install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d count168.com -d www.count168.com

5) GitHub Actions Secrets（仓库 kunzzgroups/count168）
   EC2_HOST / EC2_USER=ec2-user / EC2_SSH_KEY

验证: curl -I http://127.0.0.1/login
浏览器: https://count168.com/login/...
========================================
EOF

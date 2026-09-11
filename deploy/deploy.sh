#!/usr/bin/env bash
# EC2 上执行：拉取 main 并生效（由 GitHub Actions SSH 调用，或手动运行）
# count168.com → /var/www/count168.com
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168.com}"
BRANCH="${BRANCH:-main}"

echo "==> deploy start: user=$(whoami) host=$(hostname) root=${APP_ROOT}"
df -h "$APP_ROOT" / 2>/dev/null | tail -n +2 || true

cd "$APP_ROOT"

if [[ ! -d "$APP_ROOT/.git" ]]; then
  echo "ERROR: ${APP_ROOT}/.git missing — run deploy/ec2-amazon-linux-setup.sh first"
  exit 1
fi

fix_repo_permissions() {
  echo "==> fixing repo ownership for $(whoami)"
  if ! command -v sudo >/dev/null 2>&1; then
    echo "ERROR: ${APP_ROOT}/.git is not writable and sudo is unavailable"
    exit 1
  fi
  if ! sudo chown -R "$(whoami):nginx" "$APP_ROOT"; then
    sudo chown -R "$(whoami):$(id -gn)" "$APP_ROOT"
  fi
}

if [[ ! -w "$APP_ROOT/.git/objects" ]] || [[ ! -w "$APP_ROOT/.git/FETCH_HEAD" ]]; then
  fix_repo_permissions
fi

echo "==> git fetch + reset to origin/${BRANCH}"
if ! git fetch origin "$BRANCH"; then
  echo "==> git fetch failed, retry after chown"
  fix_repo_permissions
  git fetch origin "$BRANCH"
fi
git reset --hard "origin/${BRANCH}"

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

# C168 Mobile SPA nginx include (works with certbot le-ssl after one-time patch)
# Use a .net-specific include filename so it does not clash with count168.site on the same EC2.
MOBILE_INC_SRC="$APP_ROOT/deploy/nginx/c168-mobile-locations.inc"
MOBILE_INC_DST="/etc/nginx/conf.d/c168-mobile-locations-com.inc"
NGINX_SSL="/etc/nginx/conf.d/count168.com-le-ssl.conf"
NGINX_SRC="$APP_ROOT/deploy/nginx/count168.com.amazon-linux.conf"
NGINX_DST="/etc/nginx/conf.d/count168.com.conf"
LE_CERT="/etc/letsencrypt/live/count168.com/fullchain.pem"

# certbot 会把旧的 inline SPA 正则拷进 le-ssl；仅更新 .inc 时 HTTPS 仍可能走旧正则
patch_mobile_spa_maintenance() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if sudo grep -q '|account|more|reset-password|' "$f" && ! sudo grep -q '|account|maintenance|more|' "$f"; then
    echo "==> inject maintenance into mobile SPA regex: $f"
    sudo sed -i 's/|account|more|reset-password|/|account|maintenance|more|reset-password|/g' "$f"
  fi
}

if [[ -f "$MOBILE_INC_SRC" ]]; then
  echo "==> sync c168 mobile nginx include (net)"
  sudo cp "$MOBILE_INC_SRC" "$MOBILE_INC_DST"
  if [[ -f "$NGINX_SSL" ]]; then
    if ! sudo grep -q 'c168-mobile-locations-com.inc' "$NGINX_SSL"; then
      echo "==> patch count168.com-le-ssl.conf for /c168_mobile/"
      sudo sed -i '/server_name count168.com/a \    include /etc/nginx/conf.d/c168-mobile-locations-com.inc;' "$NGINX_SSL"
    fi
    patch_mobile_spa_maintenance "$NGINX_SSL"
  fi
  patch_mobile_spa_maintenance "$NGINX_DST"
fi

# 同步 Nginx 站点配置（git pull 不会自动更新 /etc/nginx/）
# certbot 已上 HTTPS 时跳过整文件覆盖，避免毁掉 le-ssl；路由增量由上方 patch 负责
if [[ -f "$LE_CERT" ]] || [[ -f "$NGINX_SSL" ]]; then
  echo "==> skip nginx full config sync (certbot HTTPS active for count168.com)"
elif [[ -f "$NGINX_SRC" ]]; then
  echo "==> sync nginx site config"
  NGINX_BAK="$(mktemp)"
  sudo cp "$NGINX_DST" "$NGINX_BAK" 2>/dev/null || true
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  sudo cp "$NGINX_SRC" "$NGINX_DST"
  # 同机若已有 .org 占用 default_server，确保 .net 不带 default_server
  sudo sed -i 's/ default_server//g' "$NGINX_DST" 2>/dev/null || true
  if ! sudo nginx -t; then
    echo "ERROR: nginx -t failed after config sync — restoring previous config"
    if [[ -f "$NGINX_BAK" ]]; then
      sudo cp "$NGINX_BAK" "$NGINX_DST"
      sudo nginx -t || true
    fi
    rm -f "$NGINX_BAK"
    exit 1
  fi
  rm -f "$NGINX_BAK"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  if ! sudo nginx -t; then
    echo "ERROR: nginx -t failed — check c168-mobile-locations-com.inc / le-ssl patch"
    exit 1
  fi
  sudo systemctl reload nginx
fi

# 手机版下载页 → /app/（源在仓库 c168_mobile/app/install-page/，APK 不进 git；缺失时从同机 site 借）
# 注意 APP_ROOT 未 export，必须显式传给子脚本，否则子脚本会退回默认的 /var/www/count168
APP_PUBLISH="${APP_ROOT}/deploy/publish-app-page.sh"
if [[ -f "$APP_PUBLISH" ]]; then
  APP_ROOT="$APP_ROOT" bash "$APP_PUBLISH" || echo "WARN: publish-app-page.sh failed (exit $?) — /app 下载页可能过期"
fi

echo "==> Deploy OK at $(date -Iseconds)"
FRONTEND_INDEX="${APP_ROOT}/frontend/dist/index.html"
if [[ -f "$FRONTEND_INDEX" ]]; then
  grep -o 'index-[A-Za-z0-9_-]*\.js' "$FRONTEND_INDEX" | head -1 || true
fi

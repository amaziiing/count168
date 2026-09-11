#!/usr/bin/env bash
# EC2 上执行：拉取 main 到 /var/www/count168.org（GitHub Actions deploy-org job / 手动）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168.org}"
BRANCH="${BRANCH:-main}"

echo "==> deploy-org start: user=$(whoami) host=$(hostname) root=${APP_ROOT}"
df -h "$APP_ROOT" / 2>/dev/null | tail -n +2 || true

if [[ ! -d "$APP_ROOT/.git" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "${SCRIPT_DIR}/bootstrap-org-repo.sh"
fi

cd "$APP_ROOT"

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

fix_web_permissions() {
  echo "==> fixing web permissions for nginx (dirs 755, files 644, SELinux)"
  if ! command -v sudo >/dev/null 2>&1; then
    return 0
  fi
  if ! sudo chown -R ec2-user:nginx "$APP_ROOT" 2>/dev/null; then
    sudo chown -R "$(whoami):nginx" "$APP_ROOT" || true
  fi
  sudo find "$APP_ROOT" -type d -exec chmod 755 {} \;
  sudo find "$APP_ROOT" -type f -exec chmod 644 {} \;
  if command -v chcon >/dev/null 2>&1; then
    sudo chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
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
if ! git reset --hard "origin/${BRANCH}"; then
  echo "==> git reset failed (often frontend/dist dir not writable) — fixing perms and retry"
  fix_repo_permissions
  fix_web_permissions
  git reset --hard "origin/${BRANCH}"
fi

fix_web_permissions

NGINX_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux.conf"
NGINX_HTTP_REDIRECT_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux-http-redirect.conf"
NGINX_SSL_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux-ssl.conf"
NGINX_MOBILE_INC_SRC="$APP_ROOT/deploy/nginx/c168-mobile-locations.inc"
NGINX_DST="/etc/nginx/conf.d/count168.org.conf"
NGINX_SSL_DST="/etc/nginx/conf.d/count168.org-le-ssl.conf"
NGINX_MOBILE_INC_DST="/etc/nginx/snippets/c168-mobile-locations.inc"
LE_CERT="/etc/letsencrypt/live/count168.org/fullchain.pem"

install_nginx_file() {
  local src="$1"
  local dst="$2"
  local label="$3"
  if [[ ! -f "$src" ]]; then
    echo "==> skip nginx sync ($label): $src missing"
    return 0
  fi
  echo "==> sync nginx $label"
  local bak
  bak="$(mktemp)"
  sudo cp "$dst" "$bak" 2>/dev/null || true
  sudo mkdir -p "$(dirname "$dst")"
  sudo cp "$src" "$dst"
  if ! sudo nginx -t; then
    echo "ERROR: nginx -t failed after syncing $label — restoring previous config"
    if [[ -f "$bak" ]]; then
      sudo cp "$bak" "$dst"
      sudo nginx -t || true
    fi
    rm -f "$bak"
    exit 1
  fi
  rm -f "$bak"
}

# Mobile SPA locations must exist before org confs that include them
install_nginx_file "$NGINX_MOBILE_INC_SRC" "$NGINX_MOBILE_INC_DST" "mobile SPA locations"

if [[ -f "$LE_CERT" ]]; then
  install_nginx_file "$NGINX_SSL_SRC" "$NGINX_SSL_DST" "org HTTPS"
  install_nginx_file "$NGINX_HTTP_REDIRECT_SRC" "$NGINX_DST" "org HTTP redirect"
else
  if [[ -f "$NGINX_SSL_DST" ]]; then
    echo "==> disable stale org HTTPS config (LetsEncrypt cert missing at $LE_CERT)"
    sudo mv "$NGINX_SSL_DST" "${NGINX_SSL_DST}.disabled.$(date +%s)" || true
  fi
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  install_nginx_file "$NGINX_SRC" "$NGINX_DST" "org HTTP (Cloudflare/origin :80)"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  sudo systemctl reload nginx || true
fi

echo "==> Deploy OK at $(date -Iseconds)"
FRONTEND_INDEX="${APP_ROOT}/frontend/dist/index.html"
if [[ ! -f "$FRONTEND_INDEX" ]]; then
  echo "ERROR: $FRONTEND_INDEX missing — nginx /login routes will return 404"
  echo "Run: cd $APP_ROOT && git fetch origin main && git reset --hard origin/main"
  exit 1
fi
if ! sudo -u nginx test -r "$FRONTEND_INDEX" 2>/dev/null; then
  echo "ERROR: nginx cannot read $FRONTEND_INDEX (fix directory execute bits on parent paths)"
  namei -l "$FRONTEND_INDEX" 2>/dev/null || true
  exit 1
fi
grep -o 'index-[A-Za-z0-9_-]*\.js' "$FRONTEND_INDEX" | head -1 || true

# 手机版下载页 → /app/（源在仓库 c168_mobile/app/install-page/，APK 不进 git；缺失时从同机 site 借）
# 注意 APP_ROOT 未 export，必须显式传给子脚本，否则子脚本会退回默认的 /var/www/count168
APP_PUBLISH="${APP_ROOT}/deploy/publish-app-page.sh"
if [[ -f "$APP_PUBLISH" ]]; then
  APP_ROOT="$APP_ROOT" bash "$APP_PUBLISH" || echo "WARN: publish-app-page.sh failed (exit $?) — /app 下载页可能过期"
fi

RT_DEPLOY="${APP_ROOT}/deploy/deploy-realtime-org.sh"
if [[ -f "$RT_DEPLOY" ]]; then
  sed -i 's/\r$//' "$RT_DEPLOY" 2>/dev/null || true
  echo "==> tx-realtime-org (count168.org only, port 3912)"
  bash "$RT_DEPLOY" || {
    echo "WARN: deploy-realtime-org.sh failed (exit $?) — org Transaction SSE may be offline"
  }
fi

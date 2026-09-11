#!/usr/bin/env bash
# EC2: install/start count168.org Transaction Payment SSE hub ONLY.
# Does NOT touch count168.site (/var/www/count168), tx-realtime.service, or port 3911.
# Safe to re-run. Does not overwrite a non-empty existing org secret.
set -euo pipefail
APP_ROOT="${APP_ROOT:-/var/www/count168.org}"
RT_DIR="${APP_ROOT}/services/tx-realtime"
ENV_FILE="${RT_DIR}/.env"
CFG_LOCAL="${APP_ROOT}/includes/config.local.php"
UNIT_SRC="${APP_ROOT}/deploy/systemd/tx-realtime-org.service"
UNIT_DST="/etc/systemd/system/tx-realtime-org.service"
SNIPPET_SRC="${APP_ROOT}/deploy/nginx/realtime-location-org.inc"
SNIPPET_DST="/etc/nginx/snippets/c168-realtime-org-locations.inc"
INCLUDE_LINE='    include /etc/nginx/snippets/c168-realtime-org-locations.inc;'
TX_PORT="${TX_REALTIME_PORT:-3912}"

# Org nginx only — never count168.site*
NGINX_ORG_SSL="/etc/nginx/conf.d/count168.org-le-ssl.conf"
NGINX_ORG_HTTP="/etc/nginx/conf.d/count168.org.conf"

echo "==> tx-realtime-org deploy (count168.org only) in ${RT_DIR} port ${TX_PORT}"

if [[ ! -f "${RT_DIR}/server.mjs" ]]; then
  echo "ERROR: ${RT_DIR}/server.mjs missing — sync org code first"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not installed (sudo dnf install -y nodejs)"
  exit 1
fi

cd "$RT_DIR"
echo "==> npm install"
npm install --omit=dev

read_php_secret() {
  if [[ ! -f "$CFG_LOCAL" ]]; then
    printf ''
    return 0
  fi
  php -r 'include $argv[1]; echo isset($tx_realtime_secret) ? (string)$tx_realtime_secret : "";' "$CFG_LOCAL" 2>/dev/null || true
}

SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  SECRET="$(grep -E '^TX_REALTIME_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(read_php_secret)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -hex 24)"
  echo "==> generated new org TX_REALTIME_SECRET"
else
  echo "==> reusing existing org TX_REALTIME_SECRET"
fi

umask 077
printf '%s\n' \
  'TX_REALTIME_HOST=127.0.0.1' \
  "TX_REALTIME_PORT=${TX_PORT}" \
  "TX_REALTIME_SECRET=${SECRET}" \
  '# Optional multi-instance (org only):' \
  '# REDIS_URL=redis://127.0.0.1:6379' \
  > "$ENV_FILE"
chmod 600 "$ENV_FILE"
chown ec2-user:ec2-user "$ENV_FILE" 2>/dev/null || true

PUBLISH_URL="http://127.0.0.1:${TX_PORT}/publish"

if [[ -f "$CFG_LOCAL" ]]; then
  if ! grep -q 'tx_realtime_secret' "$CFG_LOCAL"; then
    echo "==> append org realtime settings to config.local.php"
    {
      echo ''
      echo '// Transaction Payment realtime — count168.org (deploy/deploy-realtime-org.sh)'
      echo "\$tx_realtime_secret = '${SECRET}';"
      echo "\$tx_realtime_publish_url = '${PUBLISH_URL}';"
    } >> "$CFG_LOCAL"
  else
    CURRENT="$(read_php_secret)"
    if [[ -z "$CURRENT" ]]; then
      echo "==> filling empty tx_realtime_secret in config.local.php"
      sed -i "s/\$tx_realtime_secret = '';/\$tx_realtime_secret = '${SECRET}';/" "$CFG_LOCAL" || true
      sed -i "s/\$tx_realtime_secret = \"\";/\$tx_realtime_secret = '${SECRET}';/" "$CFG_LOCAL" || true
    else
      echo "==> config.local.php already has non-empty tx_realtime_secret"
    fi
    if grep -q 'tx_realtime_publish_url' "$CFG_LOCAL"; then
      sed -i "s|\$tx_realtime_publish_url = '[^']*';|\$tx_realtime_publish_url = '${PUBLISH_URL}';|" "$CFG_LOCAL" || true
    else
      echo "\$tx_realtime_publish_url = '${PUBLISH_URL}';" >> "$CFG_LOCAL"
    fi
  fi
  if id apache >/dev/null 2>&1; then
    chgrp apache "$CFG_LOCAL" 2>/dev/null || sudo chgrp apache "$CFG_LOCAL" || true
  fi
  chmod 640 "$CFG_LOCAL" 2>/dev/null || sudo chmod 640 "$CFG_LOCAL" || true
  echo "==> config.local.php perms: $(ls -l "$CFG_LOCAL" | awk '{print $1,$3,$4}')"
else
  echo "WARN: ${CFG_LOCAL} missing — create it and set tx_realtime_secret + tx_realtime_publish_url"
fi

if [[ -f "$UNIT_SRC" ]]; then
  echo "==> install systemd unit tx-realtime-org"
  sudo cp "$UNIT_SRC" "$UNIT_DST"
  sudo systemctl daemon-reload
  sudo systemctl enable tx-realtime-org
  sudo systemctl restart tx-realtime-org
  sleep 1
  sudo systemctl --no-pager --full status tx-realtime-org || true
fi

install_org_realtime_nginx() {
  if [[ ! -f "$SNIPPET_SRC" ]]; then
    echo "ERROR: missing snippet $SNIPPET_SRC"
    return 1
  fi
  echo "==> install nginx snippet $SNIPPET_DST"
  sudo mkdir -p "$(dirname "$SNIPPET_DST")"
  sudo cp "$SNIPPET_SRC" "$SNIPPET_DST"
}

inject_org_realtime_include() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if sudo grep -q 'c168-realtime-org-locations.inc' "$f"; then
    echo "==> nginx already includes org realtime in $f"
    return 0
  fi
  if ! sudo grep -q 'location \^~ /api/' "$f"; then
    echo "WARN: no location ^~ /api/ in $f — skip inject"
    return 0
  fi
  echo "==> inject org realtime include into $f"
  local tmp
  tmp="$(mktemp)"
  sudo awk -v inc="$INCLUDE_LINE" '
    !done && index($0, "location ^~ /api/") {
      print inc
      print ""
      done = 1
    }
    { print }
  ' "$f" > "$tmp"
  sudo cp "$tmp" "$f"
  rm -f "$tmp"
}

install_org_realtime_nginx
inject_org_realtime_include "$NGINX_ORG_SSL"
inject_org_realtime_include "$NGINX_ORG_HTTP"

if sudo nginx -t; then
  sudo systemctl reload nginx
  echo "==> nginx reloaded (org vhosts only patched)"
else
  echo "ERROR: nginx -t failed after org realtime patch"
  exit 1
fi

echo "==> health check (org port ${TX_PORT})"
curl -sS --max-time 3 "http://127.0.0.1:${TX_PORT}/health"
echo
echo "==> tx-realtime-org deploy OK (site / port 3911 untouched)"

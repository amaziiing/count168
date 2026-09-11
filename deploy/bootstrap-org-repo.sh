#!/usr/bin/env bash
# First-time setup: git clone count168.org into /var/www/count168.org
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168.org}"
REPO_URL="${REPO_URL:-https://github.com/kunzzgroups/count168.org.git}"
BRANCH="${BRANCH:-main}"

echo "==> bootstrap-org-repo: ${APP_ROOT}"

if [[ -d "${APP_ROOT}/.git" ]]; then
  echo "==> ${APP_ROOT}/.git already exists, skip bootstrap"
  exit 0
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "ERROR: sudo required to install ${APP_ROOT}"
  exit 1
fi

CONFIG_BAK=""
if [[ -f "${APP_ROOT}/includes/config.local.php" ]]; then
  CONFIG_BAK="$(mktemp)"
  if ! cp "${APP_ROOT}/includes/config.local.php" "$CONFIG_BAK" 2>/dev/null; then
    sudo cp "${APP_ROOT}/includes/config.local.php" "$CONFIG_BAK"
    sudo chown "$(whoami):$(id -gn)" "$CONFIG_BAK"
  fi
fi

CLONE_DIR="$(mktemp -d "/tmp/count168.org.clone.XXXXXX")"
cleanup() {
  rm -rf "$CLONE_DIR"
}
trap cleanup EXIT

echo "==> git clone to ${CLONE_DIR}"
git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$CLONE_DIR"

if [[ -n "$CONFIG_BAK" && -f "$CONFIG_BAK" ]]; then
  cp "$CONFIG_BAK" "${CLONE_DIR}/includes/config.local.php"
  rm -f "$CONFIG_BAK"
  CONFIG_BAK=""
fi

if [[ -d "$APP_ROOT" ]]; then
  BACKUP="${APP_ROOT}.bak.$(date +%s)"
  echo "==> move existing ${APP_ROOT} -> ${BACKUP}"
  sudo mv "$APP_ROOT" "$BACKUP"
fi

echo "==> install clone -> ${APP_ROOT}"
sudo mv "$CLONE_DIR" "$APP_ROOT"
trap - EXIT

if ! sudo chown -R "$(whoami):nginx" "$APP_ROOT"; then
  sudo chown -R "$(whoami):$(id -gn)" "$APP_ROOT"
fi

if command -v chcon >/dev/null 2>&1; then
  sudo chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

echo "==> bootstrap-org-repo OK"

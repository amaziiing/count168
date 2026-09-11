#!/usr/bin/env bash
# 把仓库里的手机版下载页发布到站点根目录的 /app/
#
# 源：仓库内 c168_mobile/app/install-page/
# 目标：$APP_ROOT/app/ —— nginx 用 server 级 root + index index.html 直接服务，无需额外 location
#
# 由 deploy.sh（count168.site）与 deploy-org.sh（count168.org）调用，也可手动跑：
#   APP_ROOT=/var/www/count168.org bash deploy/publish-app-page.sh
#
# APK 不进 git（c168_mobile/app/*.apk 已 gitignore）：
#   已存在则保留；缺失时优先从同机 count168.site 的 /app/ 借一份，避免重复上传约 6MB。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168}"
SRC="${APP_ROOT}/c168_mobile/app/install-page"
DST="${APP_ROOT}/app"

if [[ ! -d "$SRC" ]]; then
  echo "==> skip /app publish: $SRC missing"
  exit 0
fi

mkdir -p "$DST"

# 页面文件以仓库为准，每次部署覆盖（qr.png / qr-org.png / qr-com.png… 全自动带上，避免漏文件）
for f in "$SRC"/*; do
  [[ -f "$f" ]] || continue
  case "$f" in *.apk) continue;; esac
  cp -f "$f" "$DST/$(basename "$f")"
done

# APK 不进 git，也**绝不跨域名复制**：三个域名的 App 必须各自一份（各自指向自己的域名），
# 用 c168_mobile/app/build-apk-for-site.mjs 出包后分别上传到对应域名的 /app/。
if ! compgen -G "$DST/*.apk" >/dev/null 2>&1; then
  echo "WARN: $DST 里没有 *.apk — 该域名的 Android 下载会 404（出包见 c168_mobile/app/README.md）"
fi

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$DST" 2>/dev/null || true
fi

echo "==> /app published at $DST: $(ls "$DST" | tr '\n' ' ')"

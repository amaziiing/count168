# 三仓库同步与发布流程（site → org → com）

> 主开发在 **site**（`kunzzgroups/count168test`）；改完合并到 **org**（`count168.org`），再由 org 合并到 **com**（`count168`）。
> 本文是照做即可的操作手册（命令都可直接粘贴），并记录了踩过的坑。

---

## 1. 三个仓库 / 域名 / 线上目录

| 仓库 | 域名 | 服务器目录 | 自动部署（push main） |
|---|---|---|---|
| `kunzzgroups/count168test`（site） | count168.site | `/var/www/count168` | Actions「Deploy to EC2」 |
| `kunzzgroups/count168.org`（org） | count168.org | `/var/www/count168.org` | Actions「Deploy org to EC2」 |
| `kunzzgroups/count168`（com） | count168.com | `/var/www/count168.com` | Actions「Deploy to EC2」(com) |

- 三者**不是镜像**：org/com 各有自己的部署脚本、nginx 模板、数据库配置，合并时必须保留。
- 数据库各自独立（同一台 MySQL）：site=`u857194726_c168site`、org=`c168_org`、com=`c168_net`
  → 电话版 App 必须**一个域名一份包**（见第 6 节）。

---

## 2. 本地仓库准备（一次性）

```bash
cd <count168test 本地目录>
git remote -v
# 缺则补：
git remote add org https://github.com/kunzzgroups/count168.org.git
git remote add com https://github.com/kunzzgroups/count168.git

# 关键：必须是完整克隆，不能是浅克隆（shallow）
git rev-parse --is-shallow-repository     # 必须输出 false
git fetch --unshallow                      # 若上面是 true
```

> **踩坑 1：浅克隆导致推送失败。** 本地若带 `.git/shallow`，推送到 com 时 GitHub 会报
> `remote: fatal: did not receive expected object <sha>` / `error: remote unpack failed: index-pack failed`，
> 因为推送包永远缺祖先对象（现象很像 promisor/blob-filter 问题，其实不是）。
> `git fetch --unshallow` 补全历史后即可正常推送。

---

## 3. site 改完 → 合并到 org

```bash
cd <count168test>
git fetch origin && git fetch org

# 用独立 worktree 合并，别污染主工作树
git worktree add ../count168-org-merge -b org-merge org/main
cd ../count168-org-merge
git merge origin/main --no-edit -m "Merge count168test main: <一句话说明这轮改了什么>"
```

### 冲突处理约定

1. **dist 生成物**（`frontend/dist`、`c168_mobile/frontend/dist`）→ **整取 site（主线）**：
   ```bash
   git rm -r -q -f --cached frontend/dist c168_mobile/frontend/dist 2>/dev/null
   rm -rf frontend/dist c168_mobile/frontend/dist
   git checkout origin/main -- frontend/dist c168_mobile/frontend/dist
   git diff --stat origin/main -- frontend/dist c168_mobile/frontend/dist   # 必须为空
   ```
   （前提：合并后**共享源码已与主线一致**，否则 dist 与源码不符——见第 4 节的双份定义检查。）
2. **共享业务代码 / 手机版源码** → 取主线（site 或 org 侧，内容等同）：
   ```bash
   git checkout --theirs -- <文件> && git add <文件>
   ```
3. **org 专属必须保留（取 org 侧 `--ours`）**：
   `includes/config.php`（库名 `c168_org`）、`deploy/**`（org 的部署脚本与 nginx 模板）、`.github/workflows/**`
4. 只在一边新增的文件 merge 会天然保留，不要删。
5. 合并后核对（应只剩「本仓库专属 + 本仓库独有文件」）：
   ```bash
   git status --short | grep -E "^(UU|AA|DU|UD|AU|UA|DD)" ; # 必须为空
   git diff --name-status origin/main | sort -k1,1
   ```

### 推送与清理

```bash
git push org org-merge:main
cd .. && git worktree remove count168-org-merge --force && git branch -D org-merge
```

---

## 4. org → com 合并

同第 3 节，换成 com：

```bash
cd <count168test>
git fetch origin
git worktree add ../count168-com-merge -b com-merge com/main
cd ../count168-com-merge
git merge origin/main --no-edit -m "Merge count168test main: <说明>"
# 冲突规则同上（dist 取 site；共享代码取主线；com 专属保留）
git push com com-merge:main
cd .. && git worktree remove count168-com-merge --force && git branch -D com-merge
```

**com 专属必须保留**：`includes/config.php`（库名 `c168_net`）、`deploy/**`（`count168.com.*` 模板、`create-com-database.sh`、`EC2_COUNT168_COM.md`）、`.github/workflows/deploy-ec2.yml`。

> **踩坑 2：com 线曾与主线分叉一个多月**（共同祖先 2026-07-23 `3e9c65c250`），那轮合并有 147 个冲突
> （73 个 dist + 74 个源码）。规律：**大量"冲突"其实是同一份改动被两条线各自提交**（例如
> `useMobileOwnership.js` 两边都是 +848/-0）。判定方法：`git diff <base> <侧> -- <文件>` 看各自改了多少。

> **踩坑 3：合并并集垃圾。** 两边各自实现同一功能时，git 会把两边都保留，产生双份定义。
> 例：`c168_mobile/frontend/src/styles/tokens.css` 出现两份 dark 主题、报表页出现**重复的
> `useRealtimeDomain` 调用**。合并后务必检查这类文件，选主线一侧：
> ```bash
> git checkout org/main -- <文件>    # 以主线为准
> ```
> 另外 dist 与源码不一致时**不要重打包**，先把源码对齐主线即可。

---

## 5. 发布到服务器

- push 后 Actions 自动部署；先确认服务器取到了新提交：
  ```bash
  for d in count168 count168.org count168.com; do
    printf "%-14s %s\n" "$d" "$(git -C /var/www/$d rev-parse --short=9 HEAD)"
  done
  ```
- CI 没跑 / 想立刻生效，SSH 手动跑（幂等）：
  ```bash
  cd /var/www/count168       && bash deploy/deploy.sh
  cd /var/www/count168.org   && bash deploy/deploy-org.sh
  cd /var/www/count168.com   && bash deploy/deploy.sh
  ```
- 每次 deploy 会顺带：同步 nginx、重启对应 realtime、把 `c168_mobile/app/install-page/` 发布到该站 `/app/`（下载页）。

> **踩坑 4：`APP_ROOT` 没有 export。** 部署脚本里 `APP_ROOT=...` 未 export，子脚本会退回默认
> `/var/www/count168`（曾导致 org 的 `/app` 被发到 site 目录）。调用子脚本务必显式传：
> `APP_ROOT="$APP_ROOT" bash deploy/publish-app-page.sh`

> **踩坑 5：Cloudflare 缓存旧 404。** 新资源（如 `qr-com.png`）上线后可能仍 404（CF 缓存 2 小时，`cf-cache-status: HIT`）。
> 解决：页面引用时带版本参数 `?v=1`（下载页二维码已这么做），或等缓存过期。

---

## 6. 电话版 APK（一个域名一份，别混用）

```bash
cd c168_mobile/app
npm i                      # 首次：装 @capacitor/cli
npm run build:apk:site     # → dist-apk/EazyCount-v1.1-site.apk
npm run build:apk:org      # → dist-apk/EazyCount-v1.1-org.apk
npm run build:apk:com      # → dist-apk/EazyCount-v1.1-com.apk
```

上传（**绝不跨域名复制**——包内 `server.url` 是写死的，放错了用户看到的就是别家的数据）：

```bash
scp -i ~/.ssh/count168-ec2.pem dist-apk/EazyCount-v1.1-site.apk ec2-user@56.68.48.190:/var/www/count168/app/EazyCount-v1.1.apk
scp -i ~/.ssh/count168-ec2.pem dist-apk/EazyCount-v1.1-org.apk  ec2-user@56.68.48.190:/var/www/count168.org/app/EazyCount-v1.1.apk
scp -i ~/.ssh/count168-ec2.pem dist-apk/EazyCount-v1.1-com.apk  ec2-user@56.68.48.190:/var/www/count168.com/app/EazyCount-v1.1.apk
```

**必须做的验收**（解包看域名 + 线上 md5 对比本地）：

```bash
for f in dist-apk/*.apk; do
  printf "%-30s " "$f"; unzip -p "$f" assets/capacitor.config.json | tr -d '\n' | grep -o '"url": "[^"]*"'
done
curl -sS https://www.count168.com/app/EazyCount-v1.1.apk | md5sum   # 与本地 com 包一致
```

发新版：改 `android/app/build.gradle` 的 `versionCode`/`versionName` → 三个域名各出一次包 → 各自上传新文件、删旧文件 → 更新 `install-page/index.html` 的版本文案与下载文件名。

签名信息（内部分发）：

- 密钥 `c168_mobile/app/keystore/eazycount.keystore`（别名 `eazycount`，密码 `eazycount2026`）
- 备份：桌面 `eazycount.keystore.BACKUP-2026-09-11`（OneDrive 同步）、服务器 `/home/ec2-user/eazycount.keystore.backup-2026-09-11`
- ⚠️ **换签名会让已安装用户必须卸载重装**；重建密钥前先确认旧密钥真的找不回。
- 出包前置（本机、已 gitignore）：`keystore/eazycount.keystore`、`android/keystore.properties`、`android/local.properties`（`sdk.dir`）；
  需要 JDK ≥ 17 + Android SDK（`platform-tools`、`platforms;android-36`、`build-tools;36.0.0`）。
  Gradle/AGP 需要 `ANDROID_HOME`/`ANDROID_SDK_ROOT`（`build-apk-for-site.mjs` 会自动从 `local.properties` 读取并注入）。

---

## 7. 每次合并后的回归清单

- [ ] `git diff --stat origin/main -- frontend/dist c168_mobile/frontend/dist` 为空
- [ ] 本仓库 `includes/config.php` 的库名没被覆盖（org=`c168_org`、com=`c168_net`）
- [ ] 本仓库 `deploy/**`、`.github/workflows/**` 仍是本仓库的版本
- [ ] 无未解决冲突：`git diff --name-only --diff-filter=U` 为空
- [ ] 三站首页 / 登录页 200；`/app/` 200 且下载的 APK 指向自己域名
- [ ] 手机版 `/c168_mobile/login` 200，bundle 名与仓库 `c168_mobile/frontend/dist/index.html` 一致
- [ ] 三站前端 bundle 名一致（以 site 为准）

---

## 8. 永远不要做的事

1. 用 site 的 `includes/config.php` 覆盖 org / com（库名不同，站点会连错库）。
2. 把某个域名的 APK 复制到别的域名（用户会看到别家的账号与数据——这正是曾经的事故）。
3. 用 site 的 `deploy/**` 覆盖 org / com 的部署脚本与 nginx 模板。
4. 重建签名密钥前不确认旧密钥是否真的丢失（会让所有已安装用户卸载重装）。

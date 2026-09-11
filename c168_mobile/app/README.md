# EazyCount Android 壳工程(c168_mobile/app)

把手机版网页 `https://count168.site/c168_mobile/frontend/dist/` 封装成 Android App。
方案:Capacitor 8 WebView 壳 + 远程 URL(`server.url`),登录 Cookie、SSE 实时推送与网页完全同源,后端零改动。

> ⚠️ 现在是**按域名各出一份包**（site / org / com 的包各自指向自己的域名，数据各自独立）。
> 三仓库（site → org → com）同步 + 发布 + 出包上传的完整流程见
> [`docs/repo-sync-and-release.md`](../../docs/repo-sync-and-release.md)。

## 目录结构

```
app/
├─ capacitor.config.json   # 核心配置:指向线上手机版地址
├─ www/index.html          # 本地兜底页(断网时不会用到,仅作占位/重连入口)
├─ assets/                 # icon.png(1080²) + splash.png(2732²),改 logo 后跑 npm run splash
├─ keystore/               # eazycount.keystore 签名密钥(已 gitignore,勿删!)
├─ android/                # Cap add 生成的原生工程
│  ├─ keystore.properties  # 签名参数(已 gitignore)
│  └─ local.properties     # 本机 SDK 路径(已 gitignore,每台机器各写各的)
├─ install-page/           # 下载页源码(index.html + logo.png + qr.png + qr-org.png + qr-com.png),随 deploy 自动发布到 /app/
├─ build-apk-for-site.mjs  # 按域名出包(site/org/com 各一份,server.url 指向各自域名)
├─ dist-apk/               # 出包产物(已 gitignore)
├─ make-splash.mjs         # 用 sharp 生成白底居中 logo 启动图
└─ make-qr.mjs             # 生成下载页二维码 qr.png(count168.site) / qr-org.png(count168.org) / qr-com.png(count168.com)
```

## 日常出包（按域名各出一份）

三个域名的数据各自独立，所以 **site / org / com 必须各出一份 APK**（同一包名，用户装哪个就连哪个域名）：

```bash
cd c168_mobile/app
npm i                    # 首次：装 @capacitor/cli 等
npm run build:apk:site    # → dist-apk/EazyCount-v1.1-site.apk
npm run build:apk:org     # → dist-apk/EazyCount-v1.1-org.apk
npm run build:apk:com     # → dist-apk/EazyCount-v1.1-com.apk
```

`build-apk-for-site.mjs` 会把 `capacitor.config.json` 的 `server.url` 与 `www/index.html` 的重连地址临时改成对应域名，跑 `cap sync` + Gradle release，把产物拷到 `dist-apk/`，最后还原这两个文件。首次构建要下载 Gradle 和依赖，等几分钟。

前置（都在本机、已 gitignore）：

| 文件 | 内容 |
|---|---|
| `keystore/eazycount.keystore` | 签名密钥 |
| `android/keystore.properties` | `storeFile=../../keystore/eazycount.keystore`、`storePassword`、`keyAlias`、`keyPassword` |
| `android/local.properties` | `sdk.dir=<Android SDK 路径>`（如 `C:\Android\sdk`） |

需要 Node ≥ 20、JDK ≥ 17（AGP 8.13 / Gradle 8.14）；SDK 组件：`platform-tools`、`platforms;android-36`、`build-tools;36.0.0`。

**上传（三个域名各放自己那份，不要跨域名复制）**

```bash
cd c168_mobile/app && scp -i ~/.ssh/count168-ec2.pem \
  dist-apk/EazyCount-v1.1-site.apk ec2-user@56.68.48.190:/var/www/count168/app/EazyCount-v1.1.apk
scp -i ~/.ssh/count168-ec2.pem dist-apk/EazyCount-v1.1-org.apk ec2-user@56.68.48.190:/var/www/count168.org/app/EazyCount-v1.1.apk
scp -i ~/.ssh/count168-ec2.pem dist-apk/EazyCount-v1.1-com.apk ec2-user@56.68.48.190:/var/www/count168.com/app/EazyCount-v1.1.apk
```

（上传新版后可删掉各目录里的旧包；`deploy/publish-app-page.sh` 只发布 install-page 里的页面文件，**不会**再复制/借用 APK。）

**Android Studio（备用）**：`npm run open:android` → Build → Build APK(s)；注意先把 `capacitor.config.json` 的 `server.url` 改成目标域名再构建。

## 发新版改什么

| 要改的东西 | 位置 |
|---|---|
| App 显示名 | `android/app/src/main/res/values/strings.xml` 的 `app_name` + `capacitor.config.json` 的 `appName` |
| 版本号 | `android/app/build.gradle` 的 `versionCode`(每次+1)/ `versionName` |
| 线上地址 | `capacitor.config.json` → `server.url`,以及 `www/index.html` 兜底页里的重连地址 |
| 包名 | 一般不改;要改则 `capacitor.config.json`、`android/app/build.gradle` 的 `applicationId`、`android/app/src/main/java/.../MainActivity.java` 的 package 行 |
| 出包 | 改动后**三个域名都要重新出包**（`npm run build:apk:site\|org\|com`）并分别上传到各自域名的 `/app/` |

改完记得 `npx cap sync android`(仅原生插件变化时需要,纯改配置后重新构建即可)。

## 签名信息(内部分发)

- 密钥:`keystore/eazycount.keystore`,别名 `eazycount`,密码 `eazycount2026`(记录在此,丢失可按下条重建)
- 重建命令:
  ```bash
  "/c/Program Files/Java/jdk-24/bin/keytool" -genkeypair -v \
    -keystore keystore/eazycount.keystore -alias eazycount \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass eazycount2026 -keypass eazycount2026 \
    -dname "CN=EazyCount, OU=Mobile, O=Count168, C=MY"
  ```
- ⚠️ 换签名后已安装用户必须卸载重装(签名不一致无法覆盖安装)。
- ⚠️ **当前状态：本机、服务器、四个仓库的 git 历史里都找不到这把密钥**（等待从当年出包的机器/备份找回）。找回前不要用新密钥重建，否则已安装用户都要卸载重装一次。

## 新电脑环境搭建

1. 装 Node ≥ 20、JDK ≥ 17(或直接装 Android Studio,自带 JBR)
2. 装 Android SDK（Android Studio，或只装 cmdline-tools 后 `sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"`），并写 `android/local.properties` 的 `sdk.dir`
3. `cd c168_mobile/app && npm i`
4. 放好 `keystore/eazycount.keystore` 并写 `android/keystore.properties`（或从旧机拷 `keystore/` 过去）
5. `npm run build:apk:site`（以及 `:org`、`:com`）

## 下载页(install-page/)

两个入口,同一份页面(源码只有一份,二维码按域名自动切换):

| 域名 | 地址 | 电脑端显示的二维码 |
|---|---|---|
| count168.site | **https://count168.site/app/** | `qr.png` → https://count168.site/app/ |
| count168.org | **https://www.count168.org/app/** | `qr-org.png` → https://www.count168.org/app/ |

手机打开自动识别:iPhone 显示三步"添加到主屏幕"引导,Android 直接下 APK,微信内提示用浏览器打开,电脑显示二维码(选图逻辑在 `install-page/index.html` 底部脚本里)。

**发布:随 deploy 自动,不用再手动 scp 页面文件**

`deploy/publish-app-page.sh` 会把 `c168_mobile/app/install-page/` 的 `index.html`、`logo.png`、`qr.png`、`qr-org.png` 复制到站点根目录的 `app/`:

- count168.site 由 `deploy/deploy.sh` 调用 → `/var/www/count168/app/`
- count168.org 由 `deploy/deploy-org.sh` 调用 → `/var/www/count168.org/app/`

nginx 用 server 级 `root` + `index index.html` 直接服务 `/app/`,不需要额外 location。改完页面提交 push 即生效。

排查时手动补发布(EC2 上执行):

```bash
APP_ROOT=/var/www/count168.org bash /var/www/count168.org/deploy/publish-app-page.sh
APP_ROOT=/var/www/count168     bash /var/www/count168/deploy/publish-app-page.sh
```

**二维码重新生成**(改了下载页地址才需要):

```bash
cd c168_mobile/app && npm i && node make-qr.mjs   # 同时生成 qr.png 与 qr-org.png
```

**APK**(不进 git,`c168_mobile/app/*.apk`、`dist-apk/` 已 gitignore)

- **每个域名一份**、各自指向自己的域名：用 `npm run build:apk:site|org|com` 出包后，把 `dist-apk/EazyCount-v1.1-<域名>.apk` 分别 scp 到 `/var/www/<域名目录>/app/EazyCount-v1.1.apk`（详见上面「日常出包」）；
- **绝不要把某个域名的包复制到别的域名**——包里的 `server.url` 是写死的，放错了用户登录后看到的就是另一个域名的数据；
- 发新版：改 `android/app/build.gradle` 的 `versionCode`/`versionName` → 三个域名各出一次包 → 各自上传新文件、删旧文件，并同步更新 `install-page/index.html` 里的**版本号和大小文案**（Android 卡片上有两处，含下载链接文件名）。

**验证**

```bash
# /app 页面
curl -sI https://count168.site/app/ | head -1
curl -sI https://www.count168.org/app/ | head -1
curl -sI https://www.count168.com/app/ | head -1
# 各域名的 APK 可下载，且包内 server.url 指向自己（在服务器上跑）
for d in count168 count168.org count168.com; do
  python3 -c "import zipfile,sys;print('$d', zipfile.ZipFile('/var/www/$d/app/EazyCount-v1.1.apk').read('assets/capacitor.config.json').decode()[:200])"
done
```

count168.site / count168.org / count168.com 三个域名都已接 `/app/`（count168.net 未接）。

**三个域名的数据是各自独立的库**（site=`u857194726_c168site`、org=`c168_org`、com=`c168_net`），所以 App 必须一域名一份：从哪个域名下载，就用哪个域名的账号与数据。iPhone「添加到主屏幕」是按各自域名安装的（manifest 里是相对路径），本来就不受影响。

## 已做的定制

- **返回键**:有网页历史 → 网页后退;无历史 → 退出 App(`MainActivity.java`)
- **图标/启动屏**:由 `images/count_logo.png` 生成(87 个尺寸,含自适应图标)
- **主题色**:品牌蓝 `#2563EB` / 深蓝 `#1D4ED8`(`values/colors.xml`)
- **全面屏**:targetSdk 36 强制 edge-to-edge,手机版前端已用 `env(safe-area-inset-*)` 自适应,顶部栏/底部导航不会被遮
- **HTTPS only**:未开 cleartext,不支持 http 明文

## 已知取舍

- 纯远程 URL 壳:断网时显示 WebView 错误页,重连后刷新即可;不缓存网页资源
- 若日后要上 Google Play,纯套壳过审有风险,届时可切换为"dist 打包进 APK + 后端开 CORS"模式(改 `capacitor.config.json` 删掉 `server.url`,把 `frontend/dist` 内容拷进 `www/` 再 `npx cap sync`)

// 按域名出包：site / org / com 各出一份指向自己的 APK（同一包名，装哪个就连哪个域名）
//
// 用法（在 c168_mobile/app 下）：
//   npm i                 # 首次：装 @capacitor/cli 等
//   node build-apk-for-site.mjs site|org|com
//
// 前置（均在本机、已被 gitignore）：
//   keystore/eazycount.keystore       签名密钥
//   android/keystore.properties       storeFile/storePassword/keyAlias/keyPassword
//   android/local.properties          sdk.dir=<Android SDK 路径>
//
// 产物：dist-apk/EazyCount-v1.1-<site>.apk，各域名上传时统一改名 EazyCount-v1.0.apk
//（安装页里是相对链接，文件名一致就自动指向各自域名的包）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITES = {
  site: "count168.site",
  org: "www.count168.org",
  com: "www.count168.com",
};
const appUrl = (host) => `https://${host}/c168_mobile/frontend/dist/`;

const here = path.dirname(fileURLToPath(import.meta.url));
const key = String(process.argv[2] || "").toLowerCase();
const host = SITES[key];
if (!host) {
  console.error("用法: node build-apk-for-site.mjs site|org|com");
  process.exit(1);
}

const cfgPath = path.join(here, "capacitor.config.json");
const wwwPath = path.join(here, "www", "index.html");
const originalCfg = fs.readFileSync(cfgPath, "utf8");
const originalWww = fs.readFileSync(wwwPath, "utf8");

// 1) 把 server.url（以及兜底页的重连地址）改成这个域名
const cfg = JSON.parse(originalCfg);
cfg.server = { ...(cfg.server || {}), url: appUrl(host) };
fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
fs.writeFileSync(
  wwwPath,
  originalWww.replace(
    /https:\/\/(?:count168\.site|www\.count168\.org|www\.count168\.com)\/c168_mobile\/frontend\/dist\//g,
    appUrl(host),
  ),
);

const run = (cmd, args, cwd, extraEnv) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });

// Gradle/AGP 需要 ANDROID_HOME/ANDROID_SDK_ROOT（只写 local.properties 在 Windows 上会报
// "The filename, directory name, or volume label syntax is incorrect"）；sdk.dir 从 local.properties 读。
function readSdkDir() {
  try {
    const props = fs.readFileSync(path.join(here, "android", "local.properties"), "utf8");
    const m = props.match(/^\s*sdk\.dir\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/\\:/g, ":").replace(/\\\\/g, "/") : "";
  } catch {
    return "";
  }
}
const sdkDir = readSdkDir();
const env = sdkDir
  ? { ANDROID_HOME: sdkDir, ANDROID_SDK_ROOT: sdkDir }
  : {};
if (sdkDir) console.log(`==> Android SDK: ${sdkDir}`);

try {
  console.log(`==> 目标域名: ${host}`);
  console.log("==> npx cap sync android");
  run("npx", ["cap", "sync", "android"], here, env);

  console.log("==> gradlew assembleRelease");
  run("gradlew.bat", ["assembleRelease"], path.join(here, "android"), env);

  const apk = path.join(here, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
  const outDir = path.join(here, "dist-apk");
  fs.mkdirSync(outDir, { recursive: true });
  const gradle = fs.readFileSync(path.join(here, "android", "app", "build.gradle"), "utf8");
  const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || "1.0";
  const out = path.join(outDir, `EazyCount-v${versionName}-${key}.apk`);
  fs.copyFileSync(apk, out);
  console.log(`==> 产物: ${out}  (${(fs.statSync(out).size / 1048576).toFixed(2)} MB)`);
} finally {
  // 2) 还原仓库里的配置，保持工作树干净
  fs.writeFileSync(cfgPath, originalCfg);
  fs.writeFileSync(wwwPath, originalWww);
  console.log("==> 已还原 capacitor.config.json / www/index.html");
}

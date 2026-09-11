// 生成 / 更新下载页二维码
//
//   qr.png      -> https://count168.site/app/      （count168.site 下载页）
//   qr-org.png  -> https://www.count168.org/app/   （count168.org 下载页）
//   qr-com.png  -> https://www.count168.com/app/   （count168.com 下载页）
//
// 用法（qrcode 已在 package.json devDependencies）：
//   cd c168_mobile/app && npm i && node make-qr.mjs
//   node make-qr.mjs <输出目录>     # 默认写到同目录 install-page/
//
// 下载页按域名自动选图（见 install-page/index.html 底部脚本）：org 用 qr-org.png、com 用 qr-com.png，其余用 qr.png。
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, "install-page");

const TARGETS = [
  ["qr.png", "https://count168.site/app/"],
  ["qr-org.png", "https://www.count168.org/app/"],
  ["qr-com.png", "https://www.count168.com/app/"],
];

// 现有 qr.png 由这组参数生成（600×600、slate-800 #1e293b、纠错 M、margin 2），改这里会让线上二维码变化
const OPTIONS = {
  type: "png",
  errorCorrectionLevel: "M",
  margin: 2,
  width: 600,
  color: { dark: "#1e293b", light: "#ffffff" },
};

for (const [file, url] of TARGETS) {
  const out = path.join(outDir, file);
  await QRCode.toFile(out, url, OPTIONS);
  console.log(`${file}  <-  ${url}`);
}

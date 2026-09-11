import sharp from "sharp";
import { mkdirSync } from "fs";

const OUT = "../frontend/public/icons";
mkdirSync(OUT, { recursive: true });

async function make(size, logoRatio, name) {
  const logoPx = Math.round(size * logoRatio);
  const logo = await sharp("assets/icon.png").resize(logoPx, logoPx).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: logo, left: Math.round((size - logoPx) / 2), top: Math.round((size - logoPx) / 2) }])
    .png()
    .toFile(`${OUT}/${name}`);
  console.log(name, "ok");
}

await make(180, 0.78, "apple-touch-icon.png");
await make(192, 0.8, "icon-192.png");
await make(512, 0.8, "icon-512.png");
await make(512, 0.6, "icon-maskable-512.png");

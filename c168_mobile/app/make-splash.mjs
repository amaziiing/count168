import sharp from "sharp";

const iconPng = await sharp("assets/icon.png").resize(1400, 1400).png().toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: "#ffffff" },
})
  .composite([{ input: iconPng, left: 666, top: 666 }])
  .png()
  .toFile("assets/splash.png");
console.log("splash ok");

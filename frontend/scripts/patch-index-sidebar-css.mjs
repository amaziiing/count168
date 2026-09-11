/**
 * Ensure production index.html loads /frontend/dist/css/sidebar.css AFTER the Vite CSS bundle.
 * Keeps cache-bust query strings in sync when sidebar / scrollbar CSS changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const indexPath = resolve(repoRoot, "frontend/dist/index.html");
const SCROLLBAR_HREF = "/frontend/dist/css/dashboard-scrollbar.css?v=20260714-announcement-card-v5";
const SIDEBAR_LINK =
  '<link rel="stylesheet" href="/frontend/dist/css/sidebar.css?v=20260908-arrow-track-092fr" />';

let html = readFileSync(indexPath, "utf8");
const before = html;

html = html.replace(
  /<link rel="stylesheet" href="\/frontend\/dist\/css\/dashboard-scrollbar\.css\?v=[^"]+" \/>/,
  `<link rel="stylesheet" href="${SCROLLBAR_HREF}" />`,
);

if (html.includes("css/sidebar.css")) {
  html = html.replace(
    /<link rel="stylesheet" href="\/frontend\/dist\/css\/sidebar\.css\?v=[^"]+" \/>/,
    SIDEBAR_LINK,
  );
} else {
  const bundleCss = html.match(
    /<link rel="stylesheet" crossorigin href="\/frontend\/dist\/assets\/index-[^"]+\.css">/,
  );
  if (bundleCss) {
    html = html.replace(bundleCss[0], `${bundleCss[0]}\n    ${SIDEBAR_LINK}`);
  } else {
    html = html.replace("</head>", `    ${SIDEBAR_LINK}\n  </head>`);
  }
}

if (html !== before) {
  writeFileSync(indexPath, html, "utf8");
  console.log("[patch-index-sidebar-css] updated dist/index.html CSS links");
} else {
  console.log("[patch-index-sidebar-css] index.html already up to date");
}

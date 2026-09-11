import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Cloudflare Rocket Loader breaks Vite ES modules on count168.site */
function cloudflareModuleFix() {
  return {
    name: "cloudflare-module-fix",
    transformIndexHtml(html) {
      return html
        .replace(
          /<script type="module"(?![^>]*data-cfasync)/g,
          '<script type="module" data-cfasync="false"',
        )
        .replace(
          /<link rel="stylesheet"(?![^>]*data-cfasync)/g,
          '<link rel="stylesheet" data-cfasync="false"',
        );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const phpTarget = env.VITE_PHP_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react(), tailwindcss(), cloudflareModuleFix()],
    base: mode === "production" ? "/c168_mobile/frontend/dist/" : "/",
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        "/api": { target: phpTarget, changeOrigin: true },
        "/dashboard.php": { target: phpTarget, changeOrigin: true },
        "/member.php": { target: phpTarget, changeOrigin: true },
        "/reset-password": { target: phpTarget, changeOrigin: true },
        "/images": { target: phpTarget, changeOrigin: true },
        "/js": { target: phpTarget, changeOrigin: true },
        // SSE hub (services/tx-realtime); same path nginx uses in production.
        // nginx strips the /realtime prefix; the hub only serves /sse and /publish.
        "/realtime": {
          target: env.VITE_REALTIME_PROXY_TARGET || "http://127.0.0.1:3911",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/realtime/, ""),
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});

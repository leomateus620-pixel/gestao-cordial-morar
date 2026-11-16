import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  cacheDir: "node_modules/.vite-public-bot-preview",
  plugins: [
    react(),
    {
      name: "public-bot-explicit-synthetic-preview",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url?.startsWith("/__l5e/assets-v1/"))
            request.url = request.url.includes("logo-morar")
              ? "/morar-site/logo.jpg"
              : "/cordial-site/logo.png";
          if (request.url?.match(/^\/api\/(cordial|morar)-site\/media\//))
            request.url = "/src/assets/properties/casa-vila-nova.jpg";
          if (request.url?.match(/^\/site(?:-morar)?(?:[/?]|$)/))
            request.url = "/tests/public-property-bot/preview.html";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(
          new URL("../morar-site/preview/client-runtime.ts", import.meta.url),
        ),
      },
      { find: "@", replacement: `${root}src` },
    ],
  },
  optimizeDeps: { entries: ["tests/public-property-bot/preview.html"] },
  server: { host: "127.0.0.1", port: 4186, strictPort: true },
});

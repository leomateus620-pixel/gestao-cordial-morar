import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  root,
  optimizeDeps: { entries: ["tests/morar-site/preview/index.html"] },
  plugins: [
    react(),
    {
      name: "morar-public-readonly-preview",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          // This preview cannot transmit a contact form or any production mutation.
          if (request.url?.startsWith("/api/") && !["GET", "HEAD"].includes(request.method ?? "")) {
            response.statusCode = 405;
            response.end("Prévia somente para leitura.");
            return;
          }
          if (request.url?.startsWith("/site-morar") || request.url?.startsWith("/site"))
            request.url = "/tests/morar-site/preview/index.html";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./client-runtime.ts", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("../../../src", import.meta.url)) },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    proxy: {
      "/api/morar-site": { target: "https://cordialgestao.com", changeOrigin: true },
      "/api/cordial-site": { target: "https://cordialgestao.com", changeOrigin: true },
      "/__l5e/assets-v1": { target: "https://cordialgestao.com", changeOrigin: true },
    },
  },
});

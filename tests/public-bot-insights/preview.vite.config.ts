import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/public-bot-insights/preview.html"] },
  resolve: { alias: { "@": root + "src" } },
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
});

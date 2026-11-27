import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: ["tests/dashboard/preview.html", "tests/dashboard/audience-preview.html"],
  },
  resolve: {
    alias: [
      {
        find: "@/hooks/useDashboardMetrics",
        replacement: fileURLToPath(new URL("./metrics-fixture.ts", import.meta.url)),
      },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
});

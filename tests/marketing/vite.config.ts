import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./transport-fixture.ts", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/marketing/preview.html"] },
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./server-shim.ts", import.meta.url)),
      },
      { find: /^(.*\/)?ads\.functions$/, replacement: fixture },
      { find: /^(.*\/)?action-permissions\.functions$/, replacement: fixture },
      { find: /^(.*\/)?entity-insights\.functions$/, replacement: fixture },
      { find: /^(.*\/)?entity-report\.functions$/, replacement: fixture },
      { find: /^(.*\/)?webhook-status\.functions$/, replacement: fixture },
      { find: /^(.*\/)?drafts\.functions$/, replacement: fixture },
      { find: /^(.*\/)?reports\.functions$/, replacement: fixture },
      { find: /^(.*\/)?leads-admin\.functions$/, replacement: fixture },
      { find: /^(.*\/)?marketing\.functions$/, replacement: fixture },
      { find: /^(.*\/)?google-overview\.functions$/, replacement: fixture },
      { find: /^(.*\/)?leadgen\.functions$/, replacement: fixture },
      { find: /^(.*\/)?leads\.functions$/, replacement: fixture },
      { find: /^(.*\/)?attendances\.functions$/, replacement: fixture },
      { find: /^(.*\/)?imoveis\.functions$/, replacement: fixture },
      {
        find: "@/lib/auth-mock",
        replacement: fileURLToPath(new URL("./session-fixture.ts", import.meta.url)),
      },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
});

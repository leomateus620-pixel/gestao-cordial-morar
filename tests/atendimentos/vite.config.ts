import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./transport-fixture.ts", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/atendimentos/preview.html"] },
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./server-shim.ts", import.meta.url)),
      },
      // All remote transports used by this route are replaced. This preview
      // cannot send a real CRM mutation, mail, calendar event or sale.
      { find: /^(.*\/)?[\w-]+\.functions$/, replacement: fixture },
      {
        find: "@/lib/auth-mock",
        replacement: fileURLToPath(new URL("./session-fixture.ts", import.meta.url)),
      },
      {
        find: "@/store/app-store",
        replacement: fileURLToPath(new URL("./store-fixture.ts", import.meta.url)),
      },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 5181, strictPort: true },
});

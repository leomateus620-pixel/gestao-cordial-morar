import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./transport-fixture.ts", import.meta.url));
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^\.\/assistant\.functions$/, replacement: fixture },
      { find: /^\.\/actions\.functions$/, replacement: fixture },
      { find: /^\.\/bot-config\.functions$/, replacement: fixture },
      { find: "@/lib/agent/bot-config.functions", replacement: fixture },
      { find: "@/lib/agent/actions.functions", replacement: fixture },
      { find: "@/lib/agent/routines.functions", replacement: fixture },
      { find: "@/lib/agent/memory.functions", replacement: fixture },
      { find: "@/lib/agent/delegation.functions", replacement: fixture },
      { find: "@/lib/agent/assistant.functions", replacement: fixture },
      { find: "@/lib/agent/search.functions", replacement: fixture },
      { find: "@", replacement: `${root}src` },
    ],
  },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});

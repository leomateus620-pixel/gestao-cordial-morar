import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./transport-fixture.ts", import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/sidebar/preview.html"] },
  resolve: {
    alias: [
      { find: "@tanstack/react-start", replacement: fixture },
      { find: "@/lib/rentals/rentals.functions", replacement: fixture },
      { find: "@/integrations/supabase/client", replacement: fixture },
      { find: "@", replacement: `${root}src` },
    ],
  },
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
});

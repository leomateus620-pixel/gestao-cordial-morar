import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("./transport-fixture.ts", import.meta.url));
export default defineConfig({
  root,
  cacheDir: join(
    tmpdir(),
    "cordial-vistoria-vite",
    createHash("sha256").update(root).digest("hex").slice(0, 12),
  ),
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ["tests/vistoria/preview.html"] },
  resolve: {
    alias: [
      {
        find: "@/lib/vistoria/media-client",
        replacement: fileURLToPath(new URL("./recorder-fixture.ts", import.meta.url)),
      },
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./server-shim.ts", import.meta.url)),
      },
      { find: /^(.*\/)?vistoria\.functions$/, replacement: fixture },
      { find: /^(.*\/)?voice\.functions$/, replacement: fixture },
      { find: "@/lib/rentals/rentals.functions", replacement: fixture },
      {
        find: "@/lib/auth-mock",
        replacement: fileURLToPath(new URL("./session-fixture.ts", import.meta.url)),
      },
      { find: "@/integrations/supabase/client", replacement: fixture },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["tests/rentals-ui/*.vitest.tsx", "src/lib/imoveis/gallery-fallback.test.ts", "src/lib/imoveis/media-path-rule.test.ts"], environment: "happy-dom", root: fileURLToPath(new URL("../..", import.meta.url)) },
});

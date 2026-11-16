import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["tests/public-bot-insights/ui*.test.tsx"], environment: "happy-dom" },
});

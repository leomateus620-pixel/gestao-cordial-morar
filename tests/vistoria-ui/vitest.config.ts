import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/vistoria-ui/*.vitest.tsx"],
    environment: "happy-dom",
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },
});

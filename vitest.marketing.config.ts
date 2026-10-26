import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/ads/**/*.vitest.ts",
      "src/lib/marketing/*.vitest.ts",
      "src/services/marketing*.vitest.ts",
      "tests/marketing/**/*.vitest.ts",
    ],
    environment: "node",
    testTimeout: 30000,
  },
});

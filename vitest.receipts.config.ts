import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/lib/rentals/*.vitest.ts", "src/lib/ads/*.vitest.ts", "src/services/*.vitest.ts"], environment: "node" },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/lib/rentals/*.vitest.ts", "src/lib/ads/*.vitest.ts", "src/services/*.vitest.ts"],
    environment: "node",
  },
});

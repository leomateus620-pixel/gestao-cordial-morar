import { defineConfig, mergeConfig } from "vite";
import appConfig from "../../vite.config";

export default defineConfig(async (env) =>
  mergeConfig(await appConfig(env), {
    cacheDir: "node_modules/.vite-site-audience-qa",
    // The MCP runtime looks up Cloudflare bindings lazily and falls back to process.env on Node.
    build: { rollupOptions: { external: [/^cloudflare:/] } },
  }),
);

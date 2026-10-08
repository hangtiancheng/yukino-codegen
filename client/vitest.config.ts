import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Standalone vitest config for the client package. It intentionally does NOT
 * load the Vite React/Tailwind plugins from vite.config.ts: every suite under
 * tests/ targets pure logic and runs in the Node environment, so those plugins
 * would only add cost. The single thing we mirror from vite.config.ts is the
 * `@` -> ./src path alias so tests import the real modules the way the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

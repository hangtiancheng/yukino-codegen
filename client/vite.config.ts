/// <reference types="vite/client" />

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@yukino.js/sentry/vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), sentryPlugin({ dsn: "/sentry" })],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // zod's prose comments mention `@__PURE__`, which Rollup flags as an
        // annotation in an uninterpretable position; not actionable downstream.
        if (
          warning.code === "INVALID_ANNOTATION" &&
          warning.id?.includes("node_modules/")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

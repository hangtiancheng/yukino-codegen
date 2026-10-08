/// <reference types="vite/client" />

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@yukino.js/sentry/vite";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), sentryPlugin({ dsn: "/sentry" })],
  server: {
    headers: crossOriginIsolationHeaders,
    proxy: {
      // Dev-only: keep API + agent WebSocket same-origin with the Vite app so
      // credentialed requests skip cross-origin CORS. Forwarded to the backend.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: { headers: crossOriginIsolationHeaders },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

import { defineConfig } from "vitest/config";

// Unit-test config for server.
// - Node environment (server code uses node:crypto, node:fs, etc.).
// - Test APIs are imported explicitly from "vitest" (globals disabled).
// - A deterministic 32-byte base64 MCP_SECRET_KEY is injected so the AES-256-GCM
//   crypto helpers behave identically across runs and machines. It is set here
//   (before dotenv/config runs) so it wins over any server/.env value.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    env: {
      NODE_ENV: "test",
      // Vite defaults its own BASE_URL to "/", which violates the server env
      // schema's BASE_URL regex; pin it to the real value used in server/.env.
      BASE_URL: "api",
      MCP_SECRET_KEY: "Df8KKKsNMw1Ll9cfrxu+O+DINNfqcS3+HGAglLCnNyQ=",
    },
  },
});

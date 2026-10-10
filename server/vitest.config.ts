import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    env: {
      NODE_ENV: "test",
      BASE_URL: "api",
      MCP_SECRET_KEY: "Df8KKKsNMw1Ll9cfrxu+O+DINNfqcS3+HGAglLCnNyQ=",
    },
  },
});

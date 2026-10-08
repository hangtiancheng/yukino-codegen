import { z } from "zod";
import { aiEnvSchema } from "./ai.schema.js";

const baseEnvSchema = z.object({
  BASE_URL: z
    .string()
    .regex(/^[a-z0-9][a-z0-9/-]*$/u)
    .default("api"),
  PROMPT_MAX_LENGTH: z.coerce.number().int().min(1).max(50_000).default(4096),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .default("*")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.url().optional(),
  MODEL_PROVIDER_HEALTH_CHECK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MODEL_PROVIDER_HEALTH_CHECK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .default(5_000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  // Base64-encoded 32-byte key used to AES-256-GCM encrypt MCP secrets at rest.
  // The dev default MUST be overridden in production (enforced below).
  MCP_SECRET_KEY: z
    .string()
    .min(1)
    .default("c3dpZnR5LWNvZGVnZW4tZGV2LW1jcC1zZWNyZXQhISE="),
  AGENT_WORKSPACE_IDLE_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(15 * 60 * 1000),
  AGENT_WS_MAX_MESSAGE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(512 * 1024),
  GIT_SNAPSHOT_AUTHOR_NAME: z.string().min(1).default("Yukino Agent"),
  GIT_SNAPSHOT_AUTHOR_EMAIL: z.string().min(1).default("agent@yukino.local"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PASSWORD_SALT: z.string().min(1).default("yukino"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LLM_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  LLM_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  REDIS_URL: z.url().optional(),
  REQUEST_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(1024 * 1024),
  SESSION_SECRET: z.string().min(16).default("server-default-secret"),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .default(60 * 60 * 24 * 7),
});

export const envSchema = baseEnvSchema
  .extend(aiEnvSchema.shape)
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    if (value.CORS_ALLOWED_ORIGINS.includes("*")) {
      ctx.addIssue({
        code: "custom",
        message:
          "CORS_ALLOWED_ORIGINS must not include wildcard origins in production",
        path: ["CORS_ALLOWED_ORIGINS"],
      });
    }
    if (value.PASSWORD_SALT === "yukino") {
      ctx.addIssue({
        code: "custom",
        message: "PASSWORD_SALT must be overridden in production",
        path: ["PASSWORD_SALT"],
      });
    }
    if (value.SESSION_SECRET === "server-default-secret") {
      ctx.addIssue({
        code: "custom",
        message: "SESSION_SECRET must be overridden in production",
        path: ["SESSION_SECRET"],
      });
    }
    if (
      value.MCP_SECRET_KEY === "c3dpZnR5LWNvZGVnZW4tZGV2LW1jcC1zZWNyZXQhISE="
    ) {
      ctx.addIssue({
        code: "custom",
        message: "MCP_SECRET_KEY must be overridden in production",
        path: ["MCP_SECRET_KEY"],
      });
    }
    if (value.REDIS_URL === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "REDIS_URL must be configured in production",
        path: ["REDIS_URL"],
      });
    }
    if (value.STORAGE_DRIVER === "local") {
      ctx.addIssue({
        code: "custom",
        message: "STORAGE_DRIVER must not use local storage in production",
        path: ["STORAGE_DRIVER"],
      });
    }
    if (value.STORAGE_MINIO_ACCESS_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "STORAGE_MINIO_ACCESS_KEY must be configured in production",
        path: ["STORAGE_MINIO_ACCESS_KEY"],
      });
    }
    if (value.STORAGE_MINIO_SECRET_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "STORAGE_MINIO_SECRET_KEY must be configured in production",
        path: ["STORAGE_MINIO_SECRET_KEY"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

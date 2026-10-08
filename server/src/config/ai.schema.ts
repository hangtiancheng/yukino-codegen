import { z } from "zod";

export const aiEnvSchema = z.object({
  AI_API_KEY: z.string().min(1).default("sk-local"),
  AI_BASE_URL: z.string().min(1).default("http://localhost:11434/v1"),
  AI_CONTEXT_WINDOW: z.coerce.number().int().min(1).optional(),
  AI_MAX_ITERATIONS: z.coerce.number().int().min(1).default(40),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).optional(),
  AI_MODEL: z.string().min(1).default("qwen3.5"),
  AI_PROTOCOL: z
    .enum(["anthropic", "openai", "openai-compat"])
    .default("openai-compat"),
  STORAGE_DRIVER: z.enum(["local", "minio"]).default("local"),
  STORAGE_LOCAL_PUBLIC_BASE_URL: z
    .string()
    .min(1)
    .default("http://localhost:3000/storage"),
  STORAGE_LOCAL_ROOT_DIR: z.string().min(1).default("tmp/storage"),
  STORAGE_MINIO_ACCESS_KEY: z.string().min(1).optional(),
  STORAGE_MINIO_BUCKET: z.string().min(1).default("yukino-codegen"),
  STORAGE_MINIO_ENDPOINT: z.string().min(1).default("localhost"),
  STORAGE_MINIO_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  STORAGE_MINIO_PUBLIC_BASE_URL: z
    .string()
    .min(1)
    .default("http://localhost:9000/yukino-codegen"),
  STORAGE_MINIO_REGION: z.string().min(1).optional(),
  STORAGE_MINIO_SECRET_KEY: z.string().min(1).optional(),
  STORAGE_MINIO_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AiEnv = z.infer<typeof aiEnvSchema>;

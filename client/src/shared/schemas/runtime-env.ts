import { z } from "zod";

const apiBaseUrlSchema = z
  .string()
  .refine(
    (value) => /^(?:https?|wss?):\/\//iu.test(value) || value.startsWith("/"),
    {
      message:
        "VITE_API_BASE_URL must be an absolute URL or a root-relative path",
    },
  )
  .default("/api");

export const runtimeEnvSchema = z.object({
  VITE_API_BASE_URL: apiBaseUrlSchema,
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(
  source: Readonly<Record<string, unknown>>,
): RuntimeEnv {
  return runtimeEnvSchema.parse(source);
}

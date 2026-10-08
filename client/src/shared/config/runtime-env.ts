import { parseRuntimeEnv, type RuntimeEnv } from "@/shared/schemas";

let cached: RuntimeEnv | null = null;

export function getRuntimeEnv(): RuntimeEnv {
  if (cached === null) {
    cached = parseRuntimeEnv(import.meta.env);
  }
  return cached;
}

export function resetRuntimeEnvCache(): void {
  cached = null;
}

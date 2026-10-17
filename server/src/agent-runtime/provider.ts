import type { Config } from "@yukino.js/yukino";
import type { Env } from "../config/index.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const buildProviderConfig = (
  env: Env,
  modelOverride?: string | null,
  thinkingLevel?: string | null,
): Config.ProviderConfig.ProviderConfig => ({
  api_key: env.AI_API_KEY,
  base_url: env.AI_BASE_URL,
  model: modelOverride != null && modelOverride.length > 0 ? modelOverride : env.AI_MODEL,
  name: "codegen",
  protocol: env.AI_PROTOCOL,
  ...(env.AI_CONTEXT_WINDOW !== undefined && {
    context_window: env.AI_CONTEXT_WINDOW,
  }),
  ...(env.AI_MAX_OUTPUT_TOKENS !== undefined && {
    max_output_tokens: env.AI_MAX_OUTPUT_TOKENS,
  }),
  ...(thinkingLevel != null &&
    thinkingLevel.length > 0 && { thinking: thinkingLevel as ThinkingLevel }),
});

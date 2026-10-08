import type { Config } from "@yukino.js/yukino";
import { z } from "zod";
import type { AgentHookModel } from "../generated/prisma/models/AgentHook.js";

export const hookEventSchema = z.enum([
  "session_start",
  "session_end",
  "turn_start",
  "turn_end",
  "pre_send",
  "post_receive",
  "pre_tool_use",
  "post_tool_use",
  "shutdown",
]);

export const hookCreateSchema = z.object({
  event: hookEventSchema,
  matcher: z.string().max(512).optional(),
  command: z.string().min(1).max(10_000),
  enabled: z.boolean().optional(),
  timeoutMs: z.coerce.number().int().min(100).max(120_000).optional(),
});

export const hookUpdateSchema = z
  .object({
    event: hookEventSchema.optional(),
    matcher: z.string().max(512).nullable().optional(),
    command: z.string().min(1).max(10_000).optional(),
    enabled: z.boolean().optional(),
    timeoutMs: z.coerce.number().int().min(100).max(120_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No fields to update",
  });

export type HookCreateInput = z.infer<typeof hookCreateSchema>;
export type HookUpdateInput = z.infer<typeof hookUpdateSchema>;

export const toHookVo = (row: AgentHookModel) => ({
  id: row.id,
  event: row.event,
  matcher: row.matcher,
  command: row.command,
  enabled: row.enabled,
  timeoutMs: row.timeoutMs,
});

/** Maps a DB hook row to the Yukino HookConfig consumed by HookEngine. */
export const toYukinoHookConfig = (row: AgentHookModel): Config.HookConfig => ({
  id: row.id,
  event: row.event,
  action: { type: "command", command: row.command },
  ...(row.matcher !== null &&
    row.matcher.length > 0 && { condition: row.matcher }),
});

import { Hono } from "hono";
import { z } from "zod";
import { createSuccessResponse, ErrorCode } from "../common/index.js";
import type { AppHonoEnv } from "../session/index.js";

export const healthPayloadSchema = z.object({
  service: z.literal("server"),
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

export const healthSuccessResponseSchema = z.object({
  code: z.literal(ErrorCode.Success),
  data: healthPayloadSchema,
  message: z.literal("ok"),
});

export const healthRoutes = new Hono<AppHonoEnv>().get("/health", (c) => {
  const payload = healthPayloadSchema.parse({
    service: "server",
    status: "ok",
    timestamp: new Date().toISOString(),
  });

  return c.json(createSuccessResponse(payload));
});

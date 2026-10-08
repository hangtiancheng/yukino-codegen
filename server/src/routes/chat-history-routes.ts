import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppService } from "../app-module/index.js";
import { listChatHistory } from "../chat-history/chat-history-query.js";
import { createSuccessResponse, idSchema, pageRequestSchema } from "../common/index.js";
import type { PrismaDatabaseClient } from "../database/index.js";
import { type AppHonoEnv, requireAdmin } from "../session/index.js";
import { resolveAppAccess } from "./agent-shared.js";

const appChatHistoryQuerySchema = z.object({
  current: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

const adminChatHistoryQuerySchema = pageRequestSchema.extend({
  appId: idSchema.optional(),
  userId: idSchema.optional(),
  message: z.string().min(1).max(20_000).optional(),
  messageType: z.enum(["user", "ai"]).optional(),
  lastCreateTime: z.iso.datetime().optional(),
});

export type ChatHistoryRoutesDeps = Readonly<{
  appService: AppService;
  db: PrismaDatabaseClient;
}>;

export const createChatHistoryRoutes = ({ appService, db }: ChatHistoryRoutesDeps) =>
  new Hono<AppHonoEnv>()
    .get("/app/:appId", zValidator("query", appChatHistoryQuerySchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      const query = c.req.valid("query");
      const result = await listChatHistory(db, {
        ...query,
        appId: access.appId,
      });
      return c.json(createSuccessResponse(result));
    })
    .post(
      "/admin/list/page/vo",
      requireAdmin,
      zValidator("json", adminChatHistoryQuerySchema),
      async (c) => {
        const query = c.req.valid("json");
        const result = await listChatHistory(db, {
          current: query.current,
          pageSize: query.pageSize,
          ...(query.appId !== undefined && { appId: query.appId }),
          ...(query.userId !== undefined && { userId: query.userId }),
          ...(query.message !== undefined && { message: query.message }),
          ...(query.messageType !== undefined && { messageType: query.messageType }),
          ...(query.lastCreateTime !== undefined && {
            beforeCreateTime: new Date(query.lastCreateTime),
          }),
          ...(query.sortOrder !== undefined && { sortOrder: query.sortOrder }),
        });
        return c.json(createSuccessResponse(result));
      },
    );

export type ChatHistoryRoutes = ReturnType<typeof createChatHistoryRoutes>;

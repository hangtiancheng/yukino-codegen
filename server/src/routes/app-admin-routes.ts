import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  type AppAdminUpdateRequest,
  type AppService,
  appAdminUpdateSchema,
  appIdBodySchema,
  appIdQuerySchema,
  appPageQuerySchema,
} from "../app-module/index.js";
import { createSuccessResponse } from "../common/index.js";
import { type AppHonoEnv, requireAdmin } from "../session/index.js";

export type AppAdminRoutesDeps = Readonly<{
  appService: AppService;
}>;

export const createAppAdminRoutes = ({ appService }: AppAdminRoutesDeps) =>
  new Hono<AppHonoEnv>()
    .post("/delete", requireAdmin, zValidator("json", appIdBodySchema), async (c) => {
      const { id } = c.req.valid("json");
      const ok = await appService.adminDeleteApp(id);
      return c.json(createSuccessResponse(ok));
    })
    .post("/update", requireAdmin, zValidator("json", appAdminUpdateSchema), async (c) => {
      const body: AppAdminUpdateRequest = c.req.valid("json");
      const ok = await appService.adminUpdateApp(body);
      return c.json(createSuccessResponse(ok));
    })
    .post("/list/page/vo", requireAdmin, zValidator("json", appPageQuerySchema), async (c) => {
      const result = await appService.adminListAppVoByPage(c.req.valid("json"));
      return c.json(createSuccessResponse(result));
    })
    .get("/get/vo", requireAdmin, zValidator("query", appIdQuerySchema), async (c) => {
      const vo = await appService.getAppVoById(c.req.valid("query").id);
      return c.json(createSuccessResponse(vo));
    });

export type AppAdminRoutes = ReturnType<typeof createAppAdminRoutes>;

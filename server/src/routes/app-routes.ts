import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import {
  type AppAddRequest,
  type AppDownloadParam,
  type AppPageQuery,
  type AppService,
  type AppUpdateRequest,
  appAddSchema,
  appDownloadParamSchema,
  appIdBodySchema,
  appIdQuerySchema,
  appPageQuerySchema,
  appUpdateSchema,
} from "../app-module/index.js";
import { createSuccessResponse, ErrorCode, HttpError } from "../common/index.js";
import { type AppHonoEnv, requireLogin } from "../session/index.js";
import type { SessionUser } from "../session/session.schema.js";
import { createAppAdminRoutes } from "./app-admin-routes.js";
import { createAppProjectArchive } from "./app-download.js";

export type AppRoutesDeps = Readonly<{
  appService: AppService;
  projectRootDir?: string;
}>;

const requireUserId = (user: SessionUser | undefined): bigint => {
  if (user === undefined) {
    throw new HttpError(ErrorCode.NotLoginError, "User not logged in", 401);
  }
  return BigInt(user.id);
};

export const createAppRoutes = ({ appService, projectRootDir }: AppRoutesDeps) =>
  new Hono<AppHonoEnv>()
    .post("/add", requireLogin, zValidator("json", appAddSchema), async (c) => {
      const userId = requireUserId(c.get("user"));
      const body: AppAddRequest = c.req.valid("json");
      const id = await appService.addApp(body, userId);
      return c.json(createSuccessResponse(id));
    })
    .post("/update", requireLogin, zValidator("json", appUpdateSchema), async (c) => {
      const userId = requireUserId(c.get("user"));
      const body: AppUpdateRequest = c.req.valid("json");
      const ok = await appService.updateApp(body, userId);
      return c.json(createSuccessResponse(ok));
    })
    .post("/delete", requireLogin, zValidator("json", appIdBodySchema), async (c) => {
      const userId = requireUserId(c.get("user"));
      const { id } = c.req.valid("json");
      const ok = await appService.deleteApp(id, userId);
      return c.json(createSuccessResponse(ok));
    })
    .get(
      "/download/:appId",
      requireLogin,
      zValidator("param", appDownloadParamSchema),
      async (c) => {
        const { appId }: AppDownloadParam = c.req.valid("param");
        const userId = requireUserId(c.get("user"));
        const { archive, filename } = await createAppProjectArchive(
          { appService, ...(projectRootDir !== undefined && { projectRootDir }) },
          { appId, userId },
        );
        c.header("Content-Type", "application/zip");
        c.header("Content-Disposition", `attachment; filename="${filename}"`);
        return stream(c, async (responseStream) => {
          for await (const chunk of archive) {
            await responseStream.write(chunk);
          }
        });
      },
    )
    .get("/get/vo", zValidator("query", appIdQuerySchema), async (c) => {
      const { id } = c.req.valid("query");
      const vo = await appService.getAppVoById(id);
      return c.json(createSuccessResponse(vo));
    })
    .post("/my/list/page/vo", requireLogin, zValidator("json", appPageQuerySchema), async (c) => {
      const userId = requireUserId(c.get("user"));
      const query: AppPageQuery = c.req.valid("json");
      const result = await appService.myListAppVoByPage(query, userId);
      return c.json(createSuccessResponse(result));
    })
    .post("/awesome/list/page/vo", zValidator("json", appPageQuerySchema), async (c) => {
      const result = await appService.awesomeListAppVoByPage(c.req.valid("json"));
      return c.json(createSuccessResponse(result));
    })
    .route("/admin", createAppAdminRoutes({ appService }));

export type AppRoutes = ReturnType<typeof createAppRoutes>;

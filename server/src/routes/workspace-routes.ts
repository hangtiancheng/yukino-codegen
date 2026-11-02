import type { Hono } from "hono";
import type { RuntimeManager } from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import { createSuccessResponse } from "../common/index.js";
import { env } from "../config/index.js";
import type { AppHonoEnv } from "../session/index.js";
import type { PreviewState, WorkspaceManager } from "../workspace/workspace-manager.js";
import { resolveAppAccess } from "./agent-shared.js";

type Deps = {
  appService: AppService;
  manager: RuntimeManager;
  workspaces: WorkspaceManager;
};

export function previewResponse(state: PreviewState, requestUrl: string) {
  const origin = new URL(env.PREVIEW_PUBLIC_URL ?? requestUrl);
  if (env.PREVIEW_PUBLIC_URL === undefined) origin.port = String(env.PREVIEW_PORT);
  return {
    status: state.status,
    logs: state.logs,
    revision: state.revision,
    ...(state.error !== undefined && { error: state.error }),
    ...(state.path !== undefined && { url: new URL(state.path, origin).href }),
  };
}

export function registerWorkspaceRoutes(router: Hono<AppHonoEnv>, deps: Deps) {
  router.get("/:appId/workspace/preview", async (c) => {
    const access = await resolveAppAccess(c, deps.appService);
    return c.json(
      createSuccessResponse(previewResponse(deps.workspaces.status(access.appId), c.req.url)),
    );
  });
  router.post("/:appId/workspace/preview", async (c) => {
    const access = await resolveAppAccess(c, deps.appService);
    const runtime = await deps.manager.getOrCreate(access.ownerId, access.appId);
    const state = await deps.workspaces.build(access.appId, (task) => runtime.runExclusive(task));
    return c.json(createSuccessResponse(previewResponse(state, c.req.url)));
  });
}

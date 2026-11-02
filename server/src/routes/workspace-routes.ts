import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { z } from "zod";
import type { RuntimeManager } from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import { createSuccessResponse } from "../common/index.js";
import { env } from "../config/index.js";
import type { AppHonoEnv } from "../session/index.js";
import type { PreviewState, WorkspaceManager } from "../workspace/workspace-manager.js";
import { requireWritable, resolveAppAccess } from "./agent-shared.js";

type Deps = {
  appService: AppService;
  manager: RuntimeManager;
  workspaces: WorkspaceManager;
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
};
const terminalMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("input"), data: z.string().max(32_768) }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(1).max(500),
  }),
]);

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
  router.get(
    "/:appId/workspace/terminal",
    deps.upgradeWebSocket(async (c) => {
      try {
        const access = await resolveAppAccess(c, deps.appService);
        requireWritable(access);
        // Cookie-authenticated WebSockets need their own Origin check.
        const origin = c.req.header("origin");
        if (
          origin === undefined ||
          (!env.CORS_ALLOWED_ORIGINS.includes(origin) &&
            new URL(origin).host !== new URL(c.req.url).host &&
            !(
              env.NODE_ENV !== "production" &&
              new URL(origin).hostname === new URL(c.req.url).hostname &&
              new URL(origin).port === "5173"
            ))
        ) {
          throw new Error("Invalid terminal origin");
        }
        const runtime = await deps.manager.getOrCreate(access.ownerId, access.appId);
        let terminal: Awaited<ReturnType<WorkspaceManager["openTerminal"]>> | undefined;
        let closed = false;
        return {
          onOpen: (_event, ws) => {
            void deps.workspaces
              .openTerminal(
                access.appId,
                80,
                24,
                (data) => {
                  if (!closed) ws.send(JSON.stringify({ type: "output", data }));
                },
                (code) => {
                  if (!closed) {
                    ws.send(JSON.stringify({ type: "exit", code }));
                    ws.close(1000);
                  }
                },
              )
              .then((opened) => {
                if (closed) {
                  opened.dispose();
                  return;
                }
                terminal = opened;
                ws.send(JSON.stringify({ type: "ready" }));
              })
              .catch((error: unknown) => {
                if (closed) return;
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: error instanceof Error ? error.message : "Terminal failed",
                  }),
                );
                ws.close(1011);
              });
          },
          onMessage: (event, ws) => {
            if (typeof event.data !== "string" || event.data.length > 64 * 1024) {
              ws.close(1009);
              return;
            }
            let value: unknown;
            try {
              value = JSON.parse(event.data);
            } catch {
              ws.close(1008);
              return;
            }
            const parsed = terminalMessage.safeParse(value);
            if (!parsed.success) {
              ws.close(1008);
              return;
            }
            runtime.touch();
            if (parsed.data.type === "resize") terminal?.resize(parsed.data.cols, parsed.data.rows);
            else if (!runtime.isBusy) terminal?.write(parsed.data.data);
          },
          onClose: () => {
            closed = true;
            terminal?.dispose();
          },
          onError: () => {
            closed = true;
            terminal?.dispose();
          },
        };
      } catch {
        return { onOpen: (_event, ws) => ws.close(1008, "Owner or admin access required") };
      }
    }),
  );
}

import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import {
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
  type RuntimeManager,
  testMcpConnection,
  toMcpCreateData,
  toMcpUpdateData,
  toMcpVo,
  toYukinoMcpConfig,
} from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import {
  createSuccessResponse,
  ErrorCode,
  HttpError,
} from "../common/index.js";
import type { AppHonoEnv } from "../session/index.js";
import { requireWritable, resolveAppAccess } from "./agent-shared.js";

export type AgentMcpRoutesDeps = Readonly<{
  manager: RuntimeManager;
  appService: AppService;
}>;

/**
 * MCP server configuration REST under `/app/:appId/agent/mcp`. Reads are
 * redacted (never return decrypted secrets); mutations invalidate the runtime so
 * the next turn reconnects with the new set; `/test` connects and always
 * disconnects. Owner/admin only.
 */
export const registerAgentMcpRoutes = (
  router: Hono<AppHonoEnv>,
  deps: AgentMcpRoutesDeps,
): void => {
  const { appService, manager } = deps;

  router
    .get("/:appId/agent/mcp", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await manager.stores.workspaces.getOrCreate(
        access.ownerId,
        access.appId,
      );
      const rows = await manager.stores.mcp.listByWorkspace(workspace.id);
      return c.json(createSuccessResponse(rows.map(toMcpVo)));
    })
    .post(
      "/:appId/agent/mcp",
      zValidator("json", mcpServerCreateSchema),
      async (c) => {
        const access = await resolveAppAccess(c, appService);
        requireWritable(access);
        const workspace = await manager.stores.workspaces.getOrCreate(
          access.ownerId,
          access.appId,
        );
        const created = await manager.stores.mcp.create(
          toMcpCreateData(workspace.id, c.req.valid("json")),
        );
        await manager.invalidate(access.ownerId, access.appId);
        return c.json(createSuccessResponse(toMcpVo(created)));
      },
    )
    .patch(
      "/:appId/agent/mcp/:mcpId",
      zValidator("json", mcpServerUpdateSchema),
      async (c) => {
        const access = await resolveAppAccess(c, appService);
        requireWritable(access);
        const mcpId = c.req.param("mcpId");
        await requireOwnedMcp(manager, access.ownerId, access.appId, mcpId);
        const updated = await manager.stores.mcp.update(
          mcpId,
          toMcpUpdateData(c.req.valid("json")),
        );
        await manager.invalidate(access.ownerId, access.appId);
        return c.json(createSuccessResponse(toMcpVo(updated)));
      },
    )
    .delete("/:appId/agent/mcp/:mcpId", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const mcpId = c.req.param("mcpId");
      await requireOwnedMcp(manager, access.ownerId, access.appId, mcpId);
      await manager.stores.mcp.remove(mcpId);
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(true));
    })
    .post("/:appId/agent/mcp/:mcpId/test", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const mcpId = c.req.param("mcpId");
      const row = await requireOwnedMcp(
        manager,
        access.ownerId,
        access.appId,
        mcpId,
      );
      const result = await testMcpConnection(toYukinoMcpConfig(row));
      await manager.stores.mcp.updateStatus(
        mcpId,
        result.connected ? "CONNECTED" : "ERROR",
        result.error ?? null,
      );
      return c.json(createSuccessResponse(result));
    });
};

const requireOwnedMcp = async (
  manager: RuntimeManager,
  ownerId: bigint,
  appId: bigint,
  mcpId: string,
) => {
  const workspace = await manager.stores.workspaces.getOrCreate(ownerId, appId);
  const row = await manager.stores.mcp.findById(mcpId);
  if (row === null || row.workspaceId !== workspace.id) {
    throw new HttpError(ErrorCode.NotFoundError, "MCP server not found", 404);
  }
  return row;
};

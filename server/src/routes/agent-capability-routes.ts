import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  buildCommandCandidates,
  createMemoryRuntime,
  createSkillRuntime,
  hookCreateSchema,
  hookUpdateSchema,
  listSubagents,
  listTeams,
  listTeamTasks,
  type RuntimeManager,
  toHookVo,
} from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import { createSuccessResponse, ErrorCode, HttpError } from "../common/index.js";
import type { AgentSessionModel } from "../generated/prisma/models/AgentSession.js";
import type { AgentWorkspaceModel } from "../generated/prisma/models/AgentWorkspace.js";
import type { AppHonoEnv } from "../session/index.js";
import { requireWritable, resolveAppAccess } from "./agent-shared.js";

export type AgentCapabilityRoutesDeps = Readonly<{
  manager: RuntimeManager;
  appService: AppService;
}>;

const settingsPatchSchema = z
  .object({
    permissionMode: z
      .enum(["DEFAULT", "ACCEPT_EDITS", "PLAN", "DONT_ASK", "BYPASS_PERMISSIONS"])
      .optional(),
    sandboxEnabled: z.boolean().optional(),
    memoryEnabled: z.boolean().optional(),
    hooksEnabled: z.boolean().optional(),
    modelOverride: z.string().max(256).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No settings to update" });

const skillInstallSchema = z.object({
  source: z.string().min(1).max(2048),
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._-]+$/u)
    .optional(),
});

const toSettingsVo = (workspace: AgentWorkspaceModel) => ({
  hooksEnabled: workspace.hooksEnabled,
  memoryEnabled: workspace.memoryEnabled,
  modelOverride: workspace.modelOverride,
  permissionMode: workspace.permissionMode,
  sandboxEnabled: workspace.sandboxEnabled,
});

const toSessionVo = (session: AgentSessionModel) => ({
  createTime: session.createTime,
  id: session.id,
  lastActiveTime: session.lastActiveTime,
  lastEventSequence: session.lastEventSequence.toString(),
  status: session.status,
  updateTime: session.updateTime,
});

/**
 * Capability REST under `/app/:appId/agent/*`: bootstrap, skills, hooks, memory,
 * sessions, settings, and teams. Reads require any authenticated observer;
 * mutations require owner/admin. Config changes that alter the agent stack
 * (hooks, model, skills, memory) invalidate the runtime; permission/sandbox/
 * memory-flag changes are applied to the live runtime in place.
 */
export const registerAgentCapabilityRoutes = (
  router: Hono<AppHonoEnv>,
  deps: AgentCapabilityRoutesDeps,
): void => {
  const { appService, manager } = deps;
  const workspaceOf = (ownerId: bigint, appId: bigint) =>
    manager.stores.workspaces.getOrCreate(ownerId, appId);

  router
    .get("/:appId/agent/bootstrap", async (c) => {
      const access = await resolveAppAccess(c, appService);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const workDir = manager.workDirFor(access.appId);
      const sessions = await manager.stores.sessions.listByWorkspace(workspace.id);
      return c.json(
        createSuccessResponse({
          commands: buildCommandCandidates(workDir),
          currentSessionId: workspace.currentSessionId,
          readOnly: !access.writable,
          sessions: sessions.map(toSessionVo),
          settings: toSettingsVo(workspace),
          skills: createSkillRuntime(workDir).list(),
          subagents: listSubagents(workDir),
        }),
      );
    })
    .get("/:appId/agent/settings", async (c) => {
      const access = await resolveAppAccess(c, appService);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      return c.json(createSuccessResponse(toSettingsVo(workspace)));
    })
    .patch("/:appId/agent/settings", zValidator("json", settingsPatchSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const patch = c.req.valid("json");
      const updated = await manager.stores.workspaces.updateSettings(workspace.id, patch);
      const needsRebuild = patch.hooksEnabled !== undefined || patch.modelOverride !== undefined;
      if (needsRebuild) {
        await manager.invalidate(access.ownerId, access.appId);
      } else {
        manager.applySoftSettings(access.ownerId, access.appId, {
          ...(patch.permissionMode !== undefined && { permissionMode: patch.permissionMode }),
          ...(patch.sandboxEnabled !== undefined && { sandboxEnabled: patch.sandboxEnabled }),
          ...(patch.memoryEnabled !== undefined && { memoryEnabled: patch.memoryEnabled }),
        });
      }
      return c.json(createSuccessResponse(toSettingsVo(updated)));
    })
    .get("/:appId/agent/sessions", async (c) => {
      const access = await resolveAppAccess(c, appService);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const sessions = await manager.stores.sessions.listByWorkspace(workspace.id);
      return c.json(createSuccessResponse(sessions.map(toSessionVo)));
    })
    .post("/:appId/agent/sessions/:sessionId/resume", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const result = await manager.stores.sessions.resumeAndSetCurrent(
        workspace.id,
        c.req.param("sessionId"),
      );
      if (result.outcome === "not_found") {
        throw new HttpError(ErrorCode.NotFoundError, "Session not found", 404);
      }
      if (result.outcome === "busy") {
        throw new HttpError(
          ErrorCode.OperationError,
          "Running or waiting sessions cannot be resumed",
          409,
        );
      }
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(toSessionVo(result.session)));
    })
    .get("/:appId/agent/skills", async (c) => {
      const access = await resolveAppAccess(c, appService);
      return c.json(
        createSuccessResponse(createSkillRuntime(manager.workDirFor(access.appId)).list()),
      );
    })
    .post("/:appId/agent/skills/reload", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const skills = createSkillRuntime(manager.workDirFor(access.appId)).reload();
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(skills));
    })
    .post("/:appId/agent/skills/install", zValidator("json", skillInstallSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const body = c.req.valid("json");
      const result = await createSkillRuntime(manager.workDirFor(access.appId)).install(
        body.source,
        body.name,
      );
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(result));
    })
    .get("/:appId/agent/subagents", async (c) => {
      const access = await resolveAppAccess(c, appService);
      return c.json(createSuccessResponse(listSubagents(manager.workDirFor(access.appId))));
    })
    .get("/:appId/agent/memory", async (c) => {
      const access = await resolveAppAccess(c, appService);
      return c.json(
        createSuccessResponse(createMemoryRuntime(manager.workDirFor(access.appId)).list()),
      );
    })
    .delete("/:appId/agent/memory", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      createMemoryRuntime(manager.workDirFor(access.appId)).clear();
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(true));
    })
    .get("/:appId/agent/hooks", async (c) => {
      const access = await resolveAppAccess(c, appService);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const rows = await manager.stores.hooks.listByWorkspace(workspace.id);
      return c.json(createSuccessResponse(rows.map(toHookVo)));
    })
    .post("/:appId/agent/hooks", zValidator("json", hookCreateSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const body = c.req.valid("json");
      const created = await manager.stores.hooks.create({
        command: body.command,
        event: body.event,
        workspaceId: workspace.id,
        ...(body.matcher !== undefined && { matcher: body.matcher }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.timeoutMs !== undefined && { timeoutMs: body.timeoutMs }),
      });
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(toHookVo(created)));
    })
    .patch("/:appId/agent/hooks/:hookId", zValidator("json", hookUpdateSchema), async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const hookId = c.req.param("hookId");
      const existing = await manager.stores.hooks.findById(hookId);
      if (existing === null || existing.workspaceId !== workspace.id) {
        throw new HttpError(ErrorCode.NotFoundError, "Hook not found", 404);
      }
      const updated = await manager.stores.hooks.update(hookId, c.req.valid("json"));
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(toHookVo(updated)));
    })
    .delete("/:appId/agent/hooks/:hookId", async (c) => {
      const access = await resolveAppAccess(c, appService);
      requireWritable(access);
      const workspace = await workspaceOf(access.ownerId, access.appId);
      const hookId = c.req.param("hookId");
      const existing = await manager.stores.hooks.findById(hookId);
      if (existing === null || existing.workspaceId !== workspace.id) {
        throw new HttpError(ErrorCode.NotFoundError, "Hook not found", 404);
      }
      await manager.stores.hooks.remove(hookId);
      await manager.invalidate(access.ownerId, access.appId);
      return c.json(createSuccessResponse(true));
    })
    .get("/:appId/agent/teams", async (c) => {
      await resolveAppAccess(c, appService);
      return c.json(createSuccessResponse(listTeams()));
    })
    .get("/:appId/agent/teams/:teamName/tasks", async (c) => {
      await resolveAppAccess(c, appService);
      return c.json(createSuccessResponse(listTeamTasks(c.req.param("teamName"))));
    });
};

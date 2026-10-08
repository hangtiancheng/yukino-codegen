import type { PrismaDatabaseClient } from "../database/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import type {
  AgentInteractionStatus,
  AgentInteractionType,
  AgentMcpStatus,
  AgentMcpTransport,
  AgentPermissionMode,
  AgentSessionStatus,
} from "../generated/prisma/enums.js";
import type { AgentHookModel } from "../generated/prisma/models/AgentHook.js";
import type { AgentInteractionModel } from "../generated/prisma/models/AgentInteraction.js";
import type { AgentMcpServerModel } from "../generated/prisma/models/AgentMcpServer.js";
import type { AgentSessionModel } from "../generated/prisma/models/AgentSession.js";
import type { AgentTranscriptEventModel } from "../generated/prisma/models/AgentTranscriptEvent.js";
import type { AgentWorkspaceModel } from "../generated/prisma/models/AgentWorkspace.js";

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export const isSessionBusyForResume = (status: AgentSessionStatus): boolean =>
  status === "RUNNING" || status === "WAITING";

export type ResumeSessionResult =
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{ outcome: "busy"; session: AgentSessionModel }>
  | Readonly<{ outcome: "resumed"; session: AgentSessionModel }>;

export type WorkspaceSettingsPatch = Readonly<{
  permissionMode?: AgentPermissionMode | undefined;
  sandboxEnabled?: boolean | undefined;
  memoryEnabled?: boolean | undefined;
  hooksEnabled?: boolean | undefined;
  modelOverride?: string | null | undefined;
}>;

export type CreateMcpInput = Readonly<{
  workspaceId: bigint;
  name: string;
  transport: AgentMcpTransport;
  command?: string | null | undefined;
  args?: readonly string[] | null | undefined;
  url?: string | null | undefined;
  encryptedHeaders?: string | null | undefined;
  encryptedEnv?: string | null | undefined;
  enabled?: boolean | undefined;
}>;

export type UpdateMcpInput = Readonly<{
  name?: string | undefined;
  transport?: AgentMcpTransport | undefined;
  command?: string | null | undefined;
  args?: readonly string[] | null | undefined;
  url?: string | null | undefined;
  encryptedHeaders?: string | null | undefined;
  encryptedEnv?: string | null | undefined;
  enabled?: boolean | undefined;
}>;

export type CreateHookInput = Readonly<{
  workspaceId: bigint;
  event: string;
  matcher?: string | null | undefined;
  command: string;
  enabled?: boolean | undefined;
  timeoutMs?: number | undefined;
}>;

export type UpdateHookInput = Readonly<{
  event?: string | undefined;
  matcher?: string | null | undefined;
  command?: string | undefined;
  enabled?: boolean | undefined;
  timeoutMs?: number | undefined;
}>;

export const createAgentStores = (db: PrismaDatabaseClient) => {
  const workspaces = {
    findByUserApp: (userId: bigint, appId: bigint): Promise<AgentWorkspaceModel | null> =>
      db.agentWorkspace.findUnique({ where: { userId_appId: { appId, userId } } }),
    getOrCreate: (userId: bigint, appId: bigint): Promise<AgentWorkspaceModel> =>
      db.agentWorkspace.upsert({
        create: { appId, userId },
        update: {},
        where: { userId_appId: { appId, userId } },
      }),
    findById: (id: bigint): Promise<AgentWorkspaceModel | null> =>
      db.agentWorkspace.findUnique({ where: { id } }),
    updateSettings: (id: bigint, patch: WorkspaceSettingsPatch): Promise<AgentWorkspaceModel> =>
      db.agentWorkspace.update({
        data: {
          ...(patch.permissionMode !== undefined && { permissionMode: patch.permissionMode }),
          ...(patch.sandboxEnabled !== undefined && { sandboxEnabled: patch.sandboxEnabled }),
          ...(patch.memoryEnabled !== undefined && { memoryEnabled: patch.memoryEnabled }),
          ...(patch.hooksEnabled !== undefined && { hooksEnabled: patch.hooksEnabled }),
          ...(patch.modelOverride !== undefined && { modelOverride: patch.modelOverride }),
        },
        where: { id },
      }),
    setCurrentSession: (id: bigint, sessionId: string | null): Promise<AgentWorkspaceModel> =>
      db.agentWorkspace.update({ data: { currentSessionId: sessionId }, where: { id } }),
  };

  const sessions = {
    createAndSetCurrent: (workspaceId: bigint): Promise<AgentSessionModel> =>
      db.$transaction(async (tx: Prisma.TransactionClient) => {
        const session = await tx.agentSession.create({
          data: { status: "IDLE", workspaceId },
        });
        await tx.agentWorkspace.update({
          data: { currentSessionId: session.id },
          where: { id: workspaceId },
        });
        return session;
      }),
    findById: (id: string): Promise<AgentSessionModel | null> =>
      db.agentSession.findUnique({ where: { id } }),
    listByWorkspace: (workspaceId: bigint): Promise<AgentSessionModel[]> =>
      db.agentSession.findMany({ orderBy: { updateTime: "desc" }, where: { workspaceId } }),
    resumeAndSetCurrent: (workspaceId: bigint, sessionId: string): Promise<ResumeSessionResult> =>
      db.$transaction(async (tx: Prisma.TransactionClient): Promise<ResumeSessionResult> => {
        const existing = await tx.agentSession.findUnique({ where: { id: sessionId } });
        if (existing === null || existing.workspaceId !== workspaceId) {
          return { outcome: "not_found" };
        }
        if (isSessionBusyForResume(existing.status)) {
          return { outcome: "busy", session: existing };
        }
        const resumed = await tx.agentSession.update({
          data: {
            completedTime: null,
            lastActiveTime: new Date(),
            status: "IDLE",
          },
          where: { id: sessionId },
        });
        await tx.agentWorkspace.update({
          data: { currentSessionId: sessionId },
          where: { id: workspaceId },
        });
        return { outcome: "resumed", session: resumed };
      }),
    updateStatus: (
      id: string,
      status: AgentSessionStatus,
      completed = false,
    ): Promise<AgentSessionModel> =>
      db.agentSession.update({
        data: {
          lastActiveTime: new Date(),
          status,
          ...(completed && { completedTime: new Date() }),
        },
        where: { id },
      }),
    saveContext: (
      id: string,
      input: Readonly<{
        context: unknown;
        activeSkills: unknown;
        runtimeMetadata: unknown;
      }>,
    ): Promise<AgentSessionModel> =>
      db.agentSession.update({
        data: {
          activeSkills: asJson(input.activeSkills),
          context: asJson(input.context),
          lastActiveTime: new Date(),
          runtimeMetadata: asJson(input.runtimeMetadata),
        },
        where: { id },
      }),
    touch: (id: string): Promise<AgentSessionModel> =>
      db.agentSession.update({ data: { lastActiveTime: new Date() }, where: { id } }),
  };

  const transcript = {
    appendNext: (input: {
      sessionId: string;
      turnId: string | null;
      kind: string;
      payload: unknown;
    }): Promise<AgentTranscriptEventModel> =>
      db.$transaction(async (tx: Prisma.TransactionClient) => {
        const session = await tx.agentSession.update({
          data: { lastEventSequence: { increment: 1 } },
          select: { lastEventSequence: true },
          where: { id: input.sessionId },
        });
        return tx.agentTranscriptEvent.create({
          data: {
            kind: input.kind,
            payload: asJson(input.payload),
            sequence: session.lastEventSequence,
            sessionId: input.sessionId,
            turnId: input.turnId,
          },
        });
      }),
    listAfter: (
      sessionId: string,
      afterSequence: bigint,
      highWatermark: bigint,
      limit: number,
    ): Promise<AgentTranscriptEventModel[]> =>
      db.agentTranscriptEvent.findMany({
        orderBy: { sequence: "asc" },
        take: Math.min(limit, 1_000),
        where: {
          sequence: { gt: afterSequence, lte: highWatermark },
          sessionId,
        },
      }),
    listRecent: (sessionId: string, limit: number): Promise<AgentTranscriptEventModel[]> =>
      db.agentTranscriptEvent
        .findMany({ orderBy: { sequence: "desc" }, take: limit, where: { sessionId } })
        .then((rows) => rows.reverse()),
  };

  const interactions = {
    create: (input: {
      sessionId: string;
      turnId: string | null;
      type: AgentInteractionType;
      requestPayload: unknown;
      expiresTime?: Date;
    }): Promise<AgentInteractionModel> =>
      db.agentInteraction.create({
        data: {
          requestPayload: asJson(input.requestPayload),
          sessionId: input.sessionId,
          turnId: input.turnId,
          type: input.type,
          ...(input.expiresTime !== undefined && { expiresTime: input.expiresTime }),
        },
      }),
    findById: (id: string): Promise<AgentInteractionModel | null> =>
      db.agentInteraction.findUnique({ where: { id } }),
    answer: (
      id: string,
      status: AgentInteractionStatus,
      responsePayload: unknown,
    ): Promise<AgentInteractionModel> =>
      db.agentInteraction.update({
        data: { answeredTime: new Date(), responsePayload: asJson(responsePayload), status },
        where: { id },
      }),
    cancelPending: (sessionId: string): Promise<{ count: number }> =>
      db.agentInteraction.updateMany({
        data: { status: "CANCELLED" },
        where: { sessionId, status: "PENDING" },
      }),
  };

  const mcp = {
    listByWorkspace: (workspaceId: bigint): Promise<AgentMcpServerModel[]> =>
      db.agentMcpServer.findMany({ orderBy: { createTime: "asc" }, where: { workspaceId } }),
    listEnabled: (workspaceId: bigint): Promise<AgentMcpServerModel[]> =>
      db.agentMcpServer.findMany({ where: { enabled: true, workspaceId } }),
    findById: (id: string): Promise<AgentMcpServerModel | null> =>
      db.agentMcpServer.findUnique({ where: { id } }),
    create: (input: CreateMcpInput): Promise<AgentMcpServerModel> =>
      db.agentMcpServer.create({
        data: {
          command: input.command ?? null,
          enabled: input.enabled ?? true,
          encryptedEnv: input.encryptedEnv ?? null,
          encryptedHeaders: input.encryptedHeaders ?? null,
          name: input.name,
          transport: input.transport,
          url: input.url ?? null,
          workspaceId: input.workspaceId,
          ...(input.args !== undefined && input.args !== null && { args: asJson(input.args) }),
        },
      }),
    update: (id: string, input: UpdateMcpInput): Promise<AgentMcpServerModel> =>
      db.agentMcpServer.update({
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.transport !== undefined && { transport: input.transport }),
          ...(input.command !== undefined && { command: input.command }),
          ...(input.args !== undefined && input.args !== null && { args: asJson(input.args) }),
          ...(input.url !== undefined && { url: input.url }),
          ...(input.encryptedHeaders !== undefined && { encryptedHeaders: input.encryptedHeaders }),
          ...(input.encryptedEnv !== undefined && { encryptedEnv: input.encryptedEnv }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
        },
        where: { id },
      }),
    updateStatus: (
      id: string,
      status: AgentMcpStatus,
      statusMessage: string | null,
    ): Promise<AgentMcpServerModel> =>
      db.agentMcpServer.update({
        data: { lastCheckedTime: new Date(), status, statusMessage },
        where: { id },
      }),
    remove: (id: string): Promise<AgentMcpServerModel> =>
      db.agentMcpServer.delete({ where: { id } }),
  };

  const hooks = {
    listByWorkspace: (workspaceId: bigint): Promise<AgentHookModel[]> =>
      db.agentHook.findMany({ orderBy: { createTime: "asc" }, where: { workspaceId } }),
    listEnabled: (workspaceId: bigint): Promise<AgentHookModel[]> =>
      db.agentHook.findMany({ where: { enabled: true, workspaceId } }),
    findById: (id: string): Promise<AgentHookModel | null> =>
      db.agentHook.findUnique({ where: { id } }),
    create: (input: CreateHookInput): Promise<AgentHookModel> =>
      db.agentHook.create({
        data: {
          command: input.command,
          enabled: input.enabled ?? true,
          event: input.event,
          matcher: input.matcher ?? null,
          timeoutMs: input.timeoutMs ?? 10_000,
          workspaceId: input.workspaceId,
        },
      }),
    update: (id: string, input: UpdateHookInput): Promise<AgentHookModel> =>
      db.agentHook.update({
        data: {
          ...(input.event !== undefined && { event: input.event }),
          ...(input.matcher !== undefined && { matcher: input.matcher }),
          ...(input.command !== undefined && { command: input.command }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          ...(input.timeoutMs !== undefined && { timeoutMs: input.timeoutMs }),
        },
        where: { id },
      }),
    remove: (id: string): Promise<AgentHookModel> => db.agentHook.delete({ where: { id } }),
  };

  return { hooks, interactions, mcp, sessions, transcript, workspaces };
};

export type AgentStores = ReturnType<typeof createAgentStores>;

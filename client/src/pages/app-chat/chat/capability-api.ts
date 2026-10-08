import { z } from "zod";
import { httpClient } from "@/shared/api/http-client-singleton";
import type { AppId } from "@/shared/schemas";

/**
 * Capability REST client aligned to the actual server routes under
 * `/app/:appId/agent/*` (see server/src/routes/agent-*.ts). Kept separate from
 * the transcript socket: these drive the capability drawer (MCP, settings,
 * sessions, skills, memory). Secrets are never returned — MCP rows only report
 * `hasHeaders`/`hasEnv`.
 */

export const PERMISSION_MODES = [
  "DEFAULT",
  "ACCEPT_EDITS",
  "PLAN",
  "BYPASS_PERMISSIONS",
] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const mcpTransports = ["stdio", "http", "sse"] as const;
export type McpTransport = (typeof mcpTransports)[number];

const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  transport: z.enum(mcpTransports),
  command: z.string().nullable(),
  args: z.array(z.string()).default([]),
  url: z.string().nullable(),
  hasHeaders: z.boolean(),
  hasEnv: z.boolean(),
  enabled: z.boolean(),
  status: z.string(),
  statusMessage: z.string().nullable(),
  lastCheckedTime: z.string().nullable().optional(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;
const mcpServerListSchema = z.array(mcpServerSchema);

const mcpTestResultSchema = z.object({
  connected: z.boolean(),
  toolCount: z.number(),
  error: z.string().optional(),
});
export type McpTestResult = z.infer<typeof mcpTestResultSchema>;

export type McpCreateInput = {
  readonly name: string;
  readonly transport: McpTransport;
  readonly command?: string;
  readonly args?: string[];
  readonly url?: string;
  readonly env?: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly enabled?: boolean;
};

const settingsSchema = z.object({
  permissionMode: z.enum(PERMISSION_MODES).catch("BYPASS_PERMISSIONS"),
  sandboxEnabled: z.boolean(),
  memoryEnabled: z.boolean(),
  hooksEnabled: z.boolean(),
  modelOverride: z.string().nullable(),
});
export type AgentSettings = z.infer<typeof settingsSchema>;

export type SettingsPatch = Partial<{
  permissionMode: PermissionMode;
  sandboxEnabled: boolean;
  memoryEnabled: boolean;
  hooksEnabled: boolean;
  modelOverride: string | null;
}>;

const sessionSchema = z.object({
  id: z.string(),
  status: z.string(),
  lastEventSequence: z.string().optional(),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
  lastActiveTime: z.string().nullable().optional(),
});
export type AgentSession = z.infer<typeof sessionSchema>;
const sessionListSchema = z.array(sessionSchema);

const skillSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  mode: z.enum(["inline", "fork"]).catch("inline"),
  model: z.string().optional(),
});
export type AgentSkill = z.infer<typeof skillSchema>;
const skillListSchema = z.array(skillSchema);

const memorySchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  type: z.string().default(""),
  path: z.string().default(""),
});
export type AgentMemoryFile = z.infer<typeof memorySchema>;
const memoryListSchema = z.array(memorySchema);

const base = (appId: AppId): string => `app/${appId}/agent`;

export const listMcpServers = (appId: AppId): Promise<McpServer[]> =>
  httpClient.request(
    { method: "GET", url: `${base(appId)}/mcp` },
    mcpServerListSchema,
  );

export const createMcpServer = (
  appId: AppId,
  body: McpCreateInput,
): Promise<McpServer> =>
  httpClient.request(
    { method: "POST", url: `${base(appId)}/mcp`, body },
    mcpServerSchema,
  );

export const deleteMcpServer = (appId: AppId, id: string): Promise<boolean> =>
  httpClient.request(
    { method: "DELETE", url: `${base(appId)}/mcp/${id}` },
    z.boolean(),
  );

export const testMcpServer = (
  appId: AppId,
  id: string,
): Promise<McpTestResult> =>
  httpClient.request(
    { method: "POST", url: `${base(appId)}/mcp/${id}/test` },
    mcpTestResultSchema,
  );

export const getAgentSettings = (appId: AppId): Promise<AgentSettings> =>
  httpClient.request(
    { method: "GET", url: `${base(appId)}/settings` },
    settingsSchema,
  );

export const updateAgentSettings = (
  appId: AppId,
  patch: SettingsPatch,
): Promise<AgentSettings> =>
  httpClient.request(
    { method: "PATCH", url: `${base(appId)}/settings`, body: patch },
    settingsSchema,
  );

export const listAgentSessions = (appId: AppId): Promise<AgentSession[]> =>
  httpClient.request(
    { method: "GET", url: `${base(appId)}/sessions` },
    sessionListSchema,
  );

export const resumeAgentSession = (
  appId: AppId,
  sessionId: string,
): Promise<AgentSession> =>
  httpClient.request(
    { method: "POST", url: `${base(appId)}/sessions/${sessionId}/resume` },
    sessionSchema,
  );

export const listAgentSkills = (appId: AppId): Promise<AgentSkill[]> =>
  httpClient.request(
    { method: "GET", url: `${base(appId)}/skills` },
    skillListSchema,
  );

export const reloadAgentSkills = (appId: AppId): Promise<AgentSkill[]> =>
  httpClient.request(
    { method: "POST", url: `${base(appId)}/skills/reload` },
    skillListSchema,
  );

export const listAgentMemory = (appId: AppId): Promise<AgentMemoryFile[]> =>
  httpClient.request(
    { method: "GET", url: `${base(appId)}/memory` },
    memoryListSchema,
  );

export const clearAgentMemory = (appId: AppId): Promise<boolean> =>
  httpClient.request(
    { method: "DELETE", url: `${base(appId)}/memory` },
    z.boolean(),
  );

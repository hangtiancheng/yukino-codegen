import type { Config } from "@yukino.js/yukino";
import { z } from "zod";
import type { AgentMcpTransport } from "../generated/prisma/enums.js";
import type { AgentMcpServerModel } from "../generated/prisma/models/AgentMcpServer.js";
import { decryptStringMap, encryptStringMap } from "./mcp-crypto.js";
import type { CreateMcpInput, UpdateMcpInput } from "./stores.js";

const stringMapSchema = z.record(z.string().min(1), z.string());

export const mcpTransportSchema = z.enum(["stdio", "http", "sse"]);

export const mcpServerCreateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._-]+$/u),
    transport: mcpTransportSchema,
    command: z.string().min(1).max(1024).optional(),
    args: z.array(z.string().max(1024)).max(64).optional(),
    url: z.url().max(2048).optional(),
    headers: stringMapSchema.optional(),
    env: stringMapSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.transport === "stdio" &&
      (value.command === undefined || value.command.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "stdio transport requires a command",
        path: ["command"],
      });
    }
    if (value.transport !== "stdio" && value.url === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "http/sse transport requires a url",
        path: ["url"],
      });
    }
  });

export const mcpServerUpdateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._-]+$/u)
      .optional(),
    transport: mcpTransportSchema.optional(),
    command: z.string().min(1).max(1024).nullable().optional(),
    args: z.array(z.string().max(1024)).max(64).nullable().optional(),
    url: z.url().max(2048).nullable().optional(),
    headers: stringMapSchema.nullable().optional(),
    env: stringMapSchema.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No fields to update",
  });

export type McpServerCreateInput = z.infer<typeof mcpServerCreateSchema>;
export type McpServerUpdateInput = z.infer<typeof mcpServerUpdateSchema>;

const dbTransport = (
  transport: z.infer<typeof mcpTransportSchema>,
): AgentMcpTransport =>
  transport === "stdio" ? "STDIO" : transport === "http" ? "HTTP" : "SSE";

const wireTransport = (
  transport: AgentMcpServerModel["transport"],
): "stdio" | "http" | "sse" =>
  transport === "STDIO" ? "stdio" : transport === "HTTP" ? "http" : "sse";

export const toMcpCreateData = (
  workspaceId: bigint,
  input: McpServerCreateInput,
): CreateMcpInput => ({
  args: input.args ?? null,
  command: input.command ?? null,
  enabled: input.enabled ?? true,
  encryptedEnv: encryptStringMap(input.env),
  encryptedHeaders: encryptStringMap(input.headers),
  name: input.name,
  transport: dbTransport(input.transport),
  url: input.url ?? null,
  workspaceId,
});

export const toMcpUpdateData = (
  input: McpServerUpdateInput,
): UpdateMcpInput => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.transport !== undefined && {
    transport: dbTransport(input.transport),
  }),
  ...(input.command !== undefined && { command: input.command }),
  ...(input.args !== undefined && { args: input.args }),
  ...(input.url !== undefined && { url: input.url }),
  ...(input.headers !== undefined && {
    encryptedHeaders:
      input.headers === null ? null : encryptStringMap(input.headers),
  }),
  ...(input.env !== undefined && {
    encryptedEnv: input.env === null ? null : encryptStringMap(input.env),
  }),
  ...(input.enabled !== undefined && { enabled: input.enabled }),
});

/** Redacted view of an MCP server safe to return to clients (no secrets). */
export const toMcpVo = (row: AgentMcpServerModel) => ({
  id: row.id,
  name: row.name,
  transport: wireTransport(row.transport),
  command: row.command,
  args: (row.args as string[] | null) ?? [],
  url: row.url,
  hasHeaders: row.encryptedHeaders !== null,
  hasEnv: row.encryptedEnv !== null,
  enabled: row.enabled,
  status: row.status,
  statusMessage: row.statusMessage,
  lastCheckedTime: row.lastCheckedTime,
});

/** Decrypts one DB row into the Yukino MCPServerConfig used to connect. */
export const toYukinoMcpConfig = (
  row: AgentMcpServerModel,
): Config.MCPServerConfig => ({
  name: row.name,
  transport: wireTransport(row.transport),
  ...(row.command !== null && { command: row.command }),
  ...(Array.isArray(row.args) && { args: row.args as string[] }),
  ...(row.url !== null && { url: row.url }),
  ...(() => {
    const headers = decryptStringMap(row.encryptedHeaders);
    return headers !== undefined ? { headers } : {};
  })(),
  ...(() => {
    const environment = decryptStringMap(row.encryptedEnv);
    return environment !== undefined ? { env: environment } : {};
  })(),
});

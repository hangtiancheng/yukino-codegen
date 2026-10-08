import { z } from "zod";
import {
  isoTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
} from "./primitives";

/**
 * Runtime boundary schemas for the bidirectional Agent workspace.
 *
 * These mirror the server WebSocket protocol and the capability/file REST
 * contracts. Every value that crosses the network is validated with zod so the
 * client never trusts an unverified shape.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Transcript ordering counter. The server stores it as a BigInt and serializes
 * it to a decimal string so precision is never lost in JSON.
 */
export const agentSequenceSchema = z.string();

/** Branded identifiers backed by UUID columns on the server. */
export const agentSessionIdSchema = z.string().uuid().brand<"AgentSessionId">();
export type AgentSessionId = z.infer<typeof agentSessionIdSchema>;

export const agentTurnIdSchema = z.string().uuid().brand<"AgentTurnId">();
export type AgentTurnId = z.infer<typeof agentTurnIdSchema>;

export const agentInteractionIdSchema = z
  .string()
  .uuid()
  .brand<"AgentInteractionId">();
export type AgentInteractionId = z.infer<typeof agentInteractionIdSchema>;

export const agentMcpServerIdSchema = z
  .string()
  .uuid()
  .brand<"AgentMcpServerId">();
export type AgentMcpServerId = z.infer<typeof agentMcpServerIdSchema>;

export const agentHookIdSchema = z.string().uuid().brand<"AgentHookId">();
export type AgentHookId = z.infer<typeof agentHookIdSchema>;

/** Task identifiers are not always UUIDs (yukino uses short hex ids). */
export const agentTaskIdSchema = z.string().min(1).brand<"AgentTaskId">();
export type AgentTaskId = z.infer<typeof agentTaskIdSchema>;

/**
 * JSON-safe payload preserved verbatim for persisted transcript events and
 * opaque tool arguments/results.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * Backend Prisma enums serialize as SCREAMING_SNAKE_CASE. Normalize to the
 * canonical lower-case protocol values before validating.
 */
const lowerCasePreprocess = (value: unknown): unknown =>
  typeof value === "string" ? value.toLowerCase() : value;

// ---------------------------------------------------------------------------
// Runtime status & mode enums
// ---------------------------------------------------------------------------

export const agentRuntimeStatusSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum([
    "idle",
    "running",
    "waiting",
    "waiting_for_permission",
    "waiting_for_answer",
    "compacting",
    "completed",
    "aborted",
    "stopped",
    "failed",
    "error",
    "disposed",
  ]),
);
export type AgentRuntimeStatus = z.infer<typeof agentRuntimeStatusSchema>;

export const agentSessionStatusSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum([
    "idle",
    "running",
    "waiting",
    "waiting_for_permission",
    "waiting_for_answer",
    "completed",
    "aborted",
    "stopped",
    "failed",
    "error",
  ]),
);
export type AgentSessionStatus = z.infer<typeof agentSessionStatusSchema>;

export const agentPermissionModeSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["default", "accept_edits", "plan", "dont_ask", "bypass_permissions"]),
);
export type AgentPermissionMode = z.infer<typeof agentPermissionModeSchema>;

export const agentInteractionTypeSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["permission", "question"]),
);
export type AgentInteractionType = z.infer<typeof agentInteractionTypeSchema>;

export const agentInteractionStatusSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["pending", "answered", "rejected", "expired", "cancelled"]),
);
export type AgentInteractionStatus = z.infer<
  typeof agentInteractionStatusSchema
>;

export const agentTaskStatusSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["pending", "in_progress", "completed", "cancelled", "failed"]),
);
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;

// ---------------------------------------------------------------------------
// Capabilities, permissions & questions
// ---------------------------------------------------------------------------

export const agentCapabilitiesSchema = z.object({
  canRun: z.boolean(),
  canManage: z.boolean(),
  readOnly: z.boolean(),
});
export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;

/** Client decision for a blocking permission request. */
export const agentPermissionDecisionSchema = z.enum([
  "allow",
  "deny",
  "allowAlways",
]);
export type AgentPermissionDecision = z.infer<
  typeof agentPermissionDecisionSchema
>;

export const agentQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});
export type AgentQuestionOption = z.infer<typeof agentQuestionOptionSchema>;

export const agentQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  multiSelect: z.boolean(),
  options: z.array(agentQuestionOptionSchema),
  allowNotes: z.boolean().optional(),
});
export type AgentQuestion = z.infer<typeof agentQuestionSchema>;

export const agentQuestionAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1)),
  notes: z.string().optional(),
});
export type AgentQuestionAnswer = z.infer<typeof agentQuestionAnswerSchema>;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const agentCommandSourceSchema = z.enum(["builtin", "user", "skill"]);
export type AgentCommandSource = z.infer<typeof agentCommandSourceSchema>;

export const agentCommandTypeSchema = z.enum([
  "local",
  "prompt",
  "skill_fork",
  "local_ui",
]);
export type AgentCommandType = z.infer<typeof agentCommandTypeSchema>;

export const agentCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: agentCommandSourceSchema,
  commandType: agentCommandTypeSchema.optional(),
  argumentHint: z.string().optional(),
});
export type AgentCommand = z.infer<typeof agentCommandSchema>;

// ---------------------------------------------------------------------------
// Token usage & file change notifications
// ---------------------------------------------------------------------------

export const agentUsageSchema = z.object({
  inputTokens: nonNegativeIntSchema.optional(),
  outputTokens: nonNegativeIntSchema.optional(),
  totalTokens: nonNegativeIntSchema.optional(),
  cacheReadTokens: nonNegativeIntSchema.optional(),
  cacheCreationTokens: nonNegativeIntSchema.optional(),
  contextTokens: nonNegativeIntSchema.optional(),
  contextLimit: nonNegativeIntSchema.optional(),
});
export type AgentUsage = z.infer<typeof agentUsageSchema>;

export const agentFileChangeTypeSchema = z.enum([
  "created",
  "updated",
  "deleted",
  "renamed",
]);
export type AgentFileChangeType = z.infer<typeof agentFileChangeTypeSchema>;

export const agentFileChangeSchema = z.object({
  path: z.string().min(1),
  changeType: agentFileChangeTypeSchema,
  hash: z.string().optional(),
});
export type AgentFileChange = z.infer<typeof agentFileChangeSchema>;

// ---------------------------------------------------------------------------
// MCP entities (masked secrets)
// ---------------------------------------------------------------------------

export const agentMcpTransportSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["stdio", "http", "sse"]),
);
export type AgentMcpTransport = z.infer<typeof agentMcpTransportSchema>;

export const agentMcpStatusSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["disconnected", "connecting", "connected", "error"]),
);
export type AgentMcpStatus = z.infer<typeof agentMcpStatusSchema>;

/** A secret key is reported only by name; the value is never returned. */
export const agentMaskedSecretSchema = z.object({
  key: z.string().min(1),
  hasValue: z.boolean(),
});
export type AgentMaskedSecret = z.infer<typeof agentMaskedSecretSchema>;

export const agentMcpServerSchema = z.object({
  id: agentMcpServerIdSchema,
  name: z.string().min(1),
  transport: agentMcpTransportSchema,
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  env: z.array(agentMaskedSecretSchema),
  headers: z.array(agentMaskedSecretSchema),
  enabled: z.boolean(),
  status: agentMcpStatusSchema,
  statusMessage: z.string().nullable().optional(),
  toolCount: nonNegativeIntSchema.optional(),
  lastCheckedAt: isoTimestampSchema.optional(),
});
export type AgentMcpServer = z.infer<typeof agentMcpServerSchema>;

/**
 * Secret mutation on write: keep the stored value, replace it, or remove it.
 * The plaintext value is only ever sent from client to server, never back.
 */
export const agentMcpSecretMutationSchema = z
  .object({
    key: z.string().min(1),
    action: z.enum(["set", "keep", "remove"]),
    value: z.string().optional(),
  })
  .refine((entry) => entry.action !== "set" || entry.value !== undefined, {
    message: "value is required when action is set",
    path: ["value"],
  });
export type AgentMcpSecretMutation = z.infer<
  typeof agentMcpSecretMutationSchema
>;

const agentMcpNameSchema = z.string().min(1).max(128);
const agentMcpUrlSchema = z.string().url().max(2048);

/**
 * Create request. `command` (stdio) and `url` (http/sse) are mutually exclusive
 * by construction because the union is discriminated on transport.
 */
export const agentMcpCreateRequestSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    name: agentMcpNameSchema,
    command: z.string().min(1).max(1024),
    args: z.array(z.string()).optional(),
    env: z.array(agentMcpSecretMutationSchema).optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({
    transport: z.literal("http"),
    name: agentMcpNameSchema,
    url: agentMcpUrlSchema,
    headers: z.array(agentMcpSecretMutationSchema).optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({
    transport: z.literal("sse"),
    name: agentMcpNameSchema,
    url: agentMcpUrlSchema,
    headers: z.array(agentMcpSecretMutationSchema).optional(),
    enabled: z.boolean().optional(),
  }),
]);
export type AgentMcpCreateRequest = z.infer<typeof agentMcpCreateRequestSchema>;

export const agentMcpUpdateRequestSchema = z.object({
  name: agentMcpNameSchema.optional(),
  command: z.string().min(1).max(1024).nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: agentMcpUrlSchema.nullable().optional(),
  env: z.array(agentMcpSecretMutationSchema).optional(),
  headers: z.array(agentMcpSecretMutationSchema).optional(),
  enabled: z.boolean().optional(),
});
export type AgentMcpUpdateRequest = z.infer<typeof agentMcpUpdateRequestSchema>;

export const agentMcpTestResultSchema = z.object({
  success: z.boolean(),
  toolCount: nonNegativeIntSchema.optional(),
  tools: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
  durationMs: nonNegativeIntSchema.optional(),
});
export type AgentMcpTestResult = z.infer<typeof agentMcpTestResultSchema>;

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const agentSkillSourceSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["builtin", "project", "user", "plugin"]),
);
export type AgentSkillSource = z.infer<typeof agentSkillSourceSchema>;

export const agentSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: agentSkillSourceSchema.optional(),
  slashCommand: z.string().optional(),
  enabled: z.boolean().optional(),
  active: z.boolean().optional(),
  path: z.string().optional(),
});
export type AgentSkill = z.infer<typeof agentSkillSchema>;

export const agentSkillInstallRequestSchema = z.object({
  source: z.string().min(1),
});
export type AgentSkillInstallRequest = z.infer<
  typeof agentSkillInstallRequestSchema
>;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const agentHookSchema = z.object({
  id: agentHookIdSchema,
  event: z.string().min(1),
  matcher: z.string().nullable().optional(),
  command: z.string().min(1),
  enabled: z.boolean(),
  timeoutMs: positiveIntSchema.optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
});
export type AgentHook = z.infer<typeof agentHookSchema>;

export const agentHookCreateRequestSchema = z.object({
  event: z.string().min(1),
  matcher: z.string().optional(),
  command: z.string().min(1),
  enabled: z.boolean().optional(),
  timeoutMs: positiveIntSchema.optional(),
});
export type AgentHookCreateRequest = z.infer<
  typeof agentHookCreateRequestSchema
>;

export const agentHookUpdateRequestSchema = z.object({
  event: z.string().min(1).optional(),
  matcher: z.string().nullable().optional(),
  command: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  timeoutMs: positiveIntSchema.optional(),
});
export type AgentHookUpdateRequest = z.infer<
  typeof agentHookUpdateRequestSchema
>;

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const agentMemoryScopeSchema = z.preprocess(
  lowerCasePreprocess,
  z.enum(["global", "project", "session"]),
);
export type AgentMemoryScope = z.infer<typeof agentMemoryScopeSchema>;

export const agentMemoryEntrySchema = z.object({
  id: z.string().min(1),
  scope: agentMemoryScopeSchema.optional(),
  content: z.string(),
  createdAt: isoTimestampSchema.optional(),
});
export type AgentMemoryEntry = z.infer<typeof agentMemoryEntrySchema>;

export const agentMemorySummarySchema = z.object({
  totalEntries: nonNegativeIntSchema,
  instructions: z.string().nullable().optional(),
  scopes: z.record(z.string(), nonNegativeIntSchema).optional(),
});
export type AgentMemorySummary = z.infer<typeof agentMemorySummarySchema>;

export const agentMemorySchema = z.object({
  summary: agentMemorySummarySchema,
  entries: z.array(agentMemoryEntrySchema),
});
export type AgentMemory = z.infer<typeof agentMemorySchema>;

/** DELETE clears everything when `id` is omitted, or one entry when present. */
export const agentMemoryDeleteRequestSchema = z.object({
  id: z.string().min(1).optional(),
});
export type AgentMemoryDeleteRequest = z.infer<
  typeof agentMemoryDeleteRequestSchema
>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const agentSessionSummarySchema = z.object({
  id: agentSessionIdSchema,
  status: agentSessionStatusSchema,
  title: z.string().nullable().optional(),
  lastSequence: agentSequenceSchema.optional(),
  activeSkills: z.array(z.string()).optional(),
  eventCount: nonNegativeIntSchema.optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
  lastActiveAt: isoTimestampSchema.optional(),
  completedAt: isoTimestampSchema.optional(),
});
export type AgentSessionSummary = z.infer<typeof agentSessionSummarySchema>;

export const agentSessionResumeResultSchema = z.object({
  currentSessionId: agentSessionIdSchema,
  runtimeStatus: agentRuntimeStatusSchema,
  session: agentSessionSummarySchema,
});
export type AgentSessionResumeResult = z.infer<
  typeof agentSessionResumeResultSchema
>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const agentWorkspaceSettingsSchema = z.object({
  permissionMode: agentPermissionModeSchema,
  sandboxEnabled: z.boolean(),
  memoryEnabled: z.boolean(),
  hooksEnabled: z.boolean(),
  modelOverride: z.string().nullable().optional(),
});
export type AgentWorkspaceSettings = z.infer<
  typeof agentWorkspaceSettingsSchema
>;

export const agentSettingsUpdateRequestSchema = z.object({
  permissionMode: agentPermissionModeSchema.optional(),
  sandboxEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  hooksEnabled: z.boolean().optional(),
  modelOverride: z.string().nullable().optional(),
});
export type AgentSettingsUpdateRequest = z.infer<
  typeof agentSettingsUpdateRequestSchema
>;

// ---------------------------------------------------------------------------
// Teams & tasks
// ---------------------------------------------------------------------------

export const agentTeamMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  agentType: z.string().optional(),
  status: z.string().optional(),
});
export type AgentTeamMember = z.infer<typeof agentTeamMemberSchema>;

export const agentTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  members: z.array(agentTeamMemberSchema),
  taskCount: nonNegativeIntSchema.optional(),
  createdAt: isoTimestampSchema.optional(),
});
export type AgentTeam = z.infer<typeof agentTeamSchema>;

export const agentTaskSchema = z.object({
  id: agentTaskIdSchema,
  title: z.string(),
  description: z.string().optional(),
  status: agentTaskStatusSchema,
  assignee: z.string().nullable().optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;

// ---------------------------------------------------------------------------
// Persisted transcript event
// ---------------------------------------------------------------------------

export const agentTranscriptEventSchema = z.object({
  sessionId: agentSessionIdSchema,
  sequence: agentSequenceSchema,
  turnId: agentTurnIdSchema.optional(),
  kind: z.string().min(1),
  payload: jsonValueSchema,
  createdAt: isoTimestampSchema,
});
export type AgentTranscriptEvent = z.infer<typeof agentTranscriptEventSchema>;

// ---------------------------------------------------------------------------
// Pending interactions (replayed after reconnect)
// ---------------------------------------------------------------------------

export const agentPendingInteractionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("permission"),
    interactionId: agentInteractionIdSchema,
    turnId: agentTurnIdSchema.optional(),
    toolName: z.string().min(1),
    args: jsonValueSchema,
    reason: z.string().optional(),
    createdAt: isoTimestampSchema.optional(),
    expiresAt: isoTimestampSchema.optional(),
  }),
  z.object({
    type: z.literal("question"),
    interactionId: agentInteractionIdSchema,
    turnId: agentTurnIdSchema.optional(),
    questions: z.array(agentQuestionSchema),
    createdAt: isoTimestampSchema.optional(),
    expiresAt: isoTimestampSchema.optional(),
  }),
]);
export type AgentPendingInteraction = z.infer<
  typeof agentPendingInteractionSchema
>;

// ---------------------------------------------------------------------------
// Recursive IDE file tree, mutations & conflicts
// ---------------------------------------------------------------------------

export const agentFileEncodingSchema = z.enum(["utf8", "base64"]);
export type AgentFileEncoding = z.infer<typeof agentFileEncodingSchema>;

export type AgentFileTreeNode =
  | {
      type: "file";
      path: string;
      name: string;
      encoding: "utf8" | "base64";
      contents: string;
      hash: string;
    }
  | {
      type: "directory";
      path: string;
      name: string;
      children: AgentFileTreeNode[];
    };

export const agentFileTreeNodeSchema: z.ZodType<AgentFileTreeNode> = z.lazy(
  () =>
    z.union([
      z.object({
        type: z.literal("file"),
        path: z.string(),
        name: z.string().min(1),
        encoding: agentFileEncodingSchema,
        contents: z.string(),
        hash: z.string().min(1),
      }),
      z.object({
        type: z.literal("directory"),
        path: z.string(),
        name: z.string(),
        children: z.array(agentFileTreeNodeSchema),
      }),
    ]),
);

const forbiddenPathSegments = new Set([
  ".git",
  ".yukino",
  ".env",
  "node_modules",
  "dist",
  "build",
]);

/**
 * A relative POSIX path constrained the same way the server enforces it:
 * no absolute paths, backslashes, empty / dot / dot-dot segments, NUL bytes,
 * or forbidden internal directories.
 */
export const agentFilePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !value.includes("\0"), {
    message: "path must not contain NUL bytes",
  })
  .refine((value) => !value.includes("\\"), {
    message: "path must use POSIX separators",
  })
  .refine((value) => !value.startsWith("/"), {
    message: "path must be relative",
  })
  .refine(
    (value) =>
      value
        .split("/")
        .every(
          (segment) =>
            segment.length > 0 && segment !== "." && segment !== "..",
        ),
    { message: "path segments must be non-empty and not '.' or '..'" },
  )
  .refine(
    (value) =>
      value.split("/").every((segment) => !forbiddenPathSegments.has(segment)),
    { message: "path targets a forbidden directory" },
  );

export const agentFileWriteRequestSchema = z.object({
  path: agentFilePathSchema,
  contents: z.string(),
  encoding: agentFileEncodingSchema,
  expectedHash: z.string().nullable().optional(),
});
export type AgentFileWriteRequest = z.infer<typeof agentFileWriteRequestSchema>;

export const agentDirectoryCreateRequestSchema = z.object({
  path: agentFilePathSchema,
});
export type AgentDirectoryCreateRequest = z.infer<
  typeof agentDirectoryCreateRequestSchema
>;

export const agentFileRenameRequestSchema = z.object({
  from: agentFilePathSchema,
  to: agentFilePathSchema,
  expectedHash: z.string().nullable().optional(),
});
export type AgentFileRenameRequest = z.infer<
  typeof agentFileRenameRequestSchema
>;

export const agentFileDeleteRequestSchema = z.object({
  path: agentFilePathSchema,
  recursive: z.boolean().optional(),
  expectedHash: z.string().nullable().optional(),
});
export type AgentFileDeleteRequest = z.infer<
  typeof agentFileDeleteRequestSchema
>;

export const agentFileMutationResultSchema = z.object({
  path: z.string().min(1),
  hash: z.string().optional(),
});
export type AgentFileMutationResult = z.infer<
  typeof agentFileMutationResultSchema
>;

export const agentFileConflictSchema = z.object({
  path: z.string().min(1),
  expectedHash: z.string().nullable(),
  actualHash: z.string().min(1).nullable(),
  message: z.string().optional(),
});
export type AgentFileConflict = z.infer<typeof agentFileConflictSchema>;

/**
 * Mutation response. Optimistic-concurrency conflicts are modeled inside the
 * success envelope so callers branch on `status` instead of catching an error.
 */
export const agentFileMutationResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    result: agentFileMutationResultSchema,
  }),
  z.object({
    status: z.literal("conflict"),
    conflict: agentFileConflictSchema,
  }),
]);
export type AgentFileMutationResponse = z.infer<
  typeof agentFileMutationResponseSchema
>;

// ---------------------------------------------------------------------------
// Bootstrap snapshot (single REST call before the socket opens)
// ---------------------------------------------------------------------------

export const agentBootstrapSchema = z.object({
  capabilities: agentCapabilitiesSchema,
  runtimeStatus: agentRuntimeStatusSchema,
  currentSessionId: agentSessionIdSchema.nullable(),
  lastSequence: agentSequenceSchema,
  settings: agentWorkspaceSettingsSchema,
  commands: z.array(agentCommandSchema),
  skills: z.array(agentSkillSchema),
  mcpServers: z.array(agentMcpServerSchema),
  hooks: z.array(agentHookSchema),
  memory: agentMemorySchema,
  sessions: z.array(agentSessionSummarySchema),
  teams: z.array(agentTeamSchema),
  tasks: z.array(agentTaskSchema),
  pendingInteractions: z.array(agentPendingInteractionSchema),
});
export type AgentBootstrap = z.infer<typeof agentBootstrapSchema>;

// ---------------------------------------------------------------------------
// Client -> Server WebSocket messages
// ---------------------------------------------------------------------------

export const agentRuntimeActionSchema = z.enum([
  "rebuild",
  "dispose",
  "reloadSkills",
  "compact",
  "clear",
  "rewind",
  "resume",
]);
export type AgentRuntimeAction = z.infer<typeof agentRuntimeActionSchema>;

export const agentSelectedElementSchema = z.object({
  selector: z.string().optional(),
  tagName: z.string().optional(),
  text: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});
export type AgentSelectedElement = z.infer<typeof agentSelectedElementSchema>;

export const agentPreviewErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  source: z.string().optional(),
});
export type AgentPreviewError = z.infer<typeof agentPreviewErrorSchema>;

const agentWireRequestIdSchema = z.string().min(1).max(128);
const agentWireObjectSchema = z.record(z.string(), z.unknown());
const agentWireRuntimeStatusSchema = z.enum([
  "idle",
  "running",
  "waiting",
  "stopped",
  "error",
]);

const agentWirePermissionRequestSchema = z
  .object({
    toolName: z.string(),
    args: z.unknown().optional(),
    reason: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const agentWireQuestionSchema = z
  .object({
    question: z.string(),
    header: z.string(),
    options: z.array(
      z
        .object({
          label: z.string(),
          description: z.string().optional(),
        })
        .strict(),
    ),
    multiSelect: z.boolean(),
  })
  .strict();

const agentWireCommandCandidateSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    aliases: z.array(z.string()),
    type: z.string(),
  })
  .strict();

export const agentPendingInteractionWireSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("permission"),
      interactionId: agentInteractionIdSchema,
      sessionId: agentSessionIdSchema,
      turnId: agentTurnIdSchema.optional(),
      request: agentWirePermissionRequestSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("question"),
      interactionId: agentInteractionIdSchema,
      sessionId: agentSessionIdSchema,
      turnId: agentTurnIdSchema.optional(),
      questions: z.array(agentWireQuestionSchema),
    })
    .strict(),
]);
export type AgentPendingInteractionWire = z.infer<
  typeof agentPendingInteractionWireSchema
>;

export const agentClientMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("hello"),
      requestId: agentWireRequestIdSchema.optional(),
      afterSequence: agentSequenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("run"),
      requestId: agentWireRequestIdSchema,
      input: z.string().min(1).max(50_000),
      selectedElement: agentWireObjectSchema.optional(),
      previewError: z.string().max(20_000).optional(),
      clientFileRevision: z.string().max(128).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("abort"),
      requestId: agentWireRequestIdSchema,
      turnId: agentTurnIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("permission_response"),
      requestId: agentWireRequestIdSchema,
      interactionId: agentInteractionIdSchema,
      decision: z.enum(["allow", "deny"]),
      remember: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("question_response"),
      requestId: agentWireRequestIdSchema,
      interactionId: agentInteractionIdSchema,
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    })
    .strict(),
  z
    .object({
      type: z.literal("command_complete"),
      requestId: agentWireRequestIdSchema,
      commandId: agentWireRequestIdSchema,
      exitCode: z.number().int(),
      output: z.string().max(1_000_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("runtime_action"),
      requestId: agentWireRequestIdSchema,
      action: z.enum(["start", "stop", "restart", "install"]),
      command: z.string().max(10_000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("heartbeat"),
      requestId: agentWireRequestIdSchema.optional(),
      timestamp: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type AgentClientMessage = z.input<typeof agentClientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> Client WebSocket messages
// ---------------------------------------------------------------------------

const agentWireTranscriptEventSchema = z
  .object({
    sessionId: agentSessionIdSchema,
    sequence: agentSequenceSchema,
    turnId: agentTurnIdSchema.optional(),
    kind: z.string().min(1).max(128),
    payload: z.unknown(),
    createdAt: z.iso.datetime(),
  })
  .strict();

const structuredAgentEventSchema = z
  .object({
    type: z.enum([
      "agent_status",
      "assistant_delta",
      "assistant_message",
      "tool_use",
      "tool_result",
      "usage",
      "turn_complete",
    ]),
    sessionId: agentSessionIdSchema.optional(),
    sequence: agentSequenceSchema.optional(),
    turnId: agentTurnIdSchema.optional(),
    payload: z.unknown(),
  })
  .strict();

export const agentServerMessageSchema = z.union([
  z
    .object({
      type: z.literal("ready"),
      sessionId: agentSessionIdSchema,
      highWatermark: agentSequenceSchema,
      readOnly: z.boolean(),
      permissionMode: z.string(),
      runtimeStatus: agentWireRuntimeStatusSchema,
      currentTurnId: agentTurnIdSchema.nullable(),
      pendingInteractions: z.array(agentPendingInteractionWireSchema),
    })
    .strict(),
  z
    .object({ type: z.literal("event"), event: agentWireTranscriptEventSchema })
    .strict(),
  z
    .object({
      type: z.literal("transcript_batch"),
      sessionId: agentSessionIdSchema,
      highWatermark: agentSequenceSchema,
      complete: z.boolean(),
      events: z.array(agentWireTranscriptEventSchema).max(1_000),
    })
    .strict(),
  structuredAgentEventSchema,
  z
    .object({
      type: z.literal("permission_request"),
      interactionId: agentInteractionIdSchema,
      sessionId: agentSessionIdSchema,
      turnId: agentTurnIdSchema.optional(),
      request: agentWirePermissionRequestSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("question_request"),
      interactionId: agentInteractionIdSchema,
      sessionId: agentSessionIdSchema,
      turnId: agentTurnIdSchema.optional(),
      questions: z.array(agentWireQuestionSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal("interaction_resolved"),
      interactionId: agentInteractionIdSchema,
      sessionId: agentSessionIdSchema,
      outcome: z.enum([
        "allowed",
        "denied",
        "answered",
        "cancelled",
        "expired",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("command_result"),
      requestId: agentWireRequestIdSchema.optional(),
      command: z.string(),
      supported: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("candidates"),
      requestId: agentWireRequestIdSchema.optional(),
      candidates: z.array(agentWireCommandCandidateSchema),
    })
    .strict(),
  z
    .object({
      type: z.enum(["skill", "subagent", "team", "task"]),
      action: z.string(),
      payload: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("runtime_status"),
      status: agentWireRuntimeStatusSchema,
      sessionId: agentSessionIdSchema.optional(),
      turnId: agentTurnIdSchema.optional(),
      detail: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("files_changed"),
      paths: z.array(z.string()),
      revision: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      requestId: agentWireRequestIdSchema.optional(),
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("heartbeat_ack"),
      requestId: agentWireRequestIdSchema.optional(),
      timestamp: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type AgentServerMessage = z.infer<typeof agentServerMessageSchema>;
export type AgentWireTranscriptEvent = z.infer<
  typeof agentWireTranscriptEventSchema
>;

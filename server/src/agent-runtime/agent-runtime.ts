import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  Agent,
  Bootstrap,
  Commands,
  Compact,
  Config,
  Conversation,
  Goal,
  Images,
  LLM,
  MCP,
  Memory,
  Permissions,
  PlanFile,
  Prompt,
  Remote,
  Sandbox,
  Skills,
  Subagent,
  Teams,
  Tools,
  Utils,
} from "@yukino.js/yukino";
import { env } from "../config/index.js";
import type { AgentPermissionMode, AgentSessionStatus } from "../generated/prisma/enums.js";
import type { AgentTranscriptEventModel } from "../generated/prisma/models/AgentTranscriptEvent.js";
import type { AgentWorkspaceModel } from "../generated/prisma/models/AgentWorkspace.js";
import type { MetricsService } from "../observability/index.js";
import {
  buildCommandCandidates,
  type CommandCandidate,
  parseCommand,
  SERVER_SUPPORTED_COMMANDS,
} from "./command-dispatcher.js";
import { createEventAdapter } from "./event-adapter.js";
import type { GitRuntime } from "./git-runtime.js";
import { buildHookConfigs } from "./hook-runtime.js";
import {
  createInteractionBroker,
  type InteractionBroker,
  toPermissionPayload,
} from "./interaction-broker.js";
import { toYukinoMcpConfig } from "./mcp-config.js";
import { type MemoryMaintenanceTasks, createMemoryMaintenanceTasks } from "./memory-runtime.js";
import type { AgentServerMessage, AgentTranscriptEventMessage } from "./protocol.js";
import { buildProviderConfig } from "./provider.js";
import type { AgentStores } from "./stores.js";
import { TurnGate } from "./turn-gate.js";
import type { AgentConnection, PermissionDecision, QuestionAnswers } from "./types.js";
import { AsyncLock } from "./workspace-lock.js";

const REPLAY_LIMIT = 200;
const BACKLOG_BATCH_SIZE = 1_000;
/** Remote parity: pending plan approvals expire so a closed tab cannot pin the workspace. */
const PLAN_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
/** Remote parity: uploaded images follow the terminal clipboard-image limit. */
const MAX_UPLOAD_IMAGE_BYTES = 32 * 1024 * 1024;
/** @-mention file cache lifetime (matches the terminal input cache). */
const FILE_CACHE_TTL_MS = 30_000;
/** Prompt history entries sent on connect (Remote sends the last 200). */
const HISTORY_LIMIT = 200;
/** Rewind checkpoints kept per session. */
const MAX_REWIND_POINTS = 50;

/** Per-turn conversation checkpoint backing conversation rewind. */
type RewindPoint = Readonly<{
  sha: string;
  turnId: string;
  messageCount: number;
  sequence: bigint;
}>;

/** JSON-safe checkpoint form: bigint sequences persist as strings. */
type SerializedRewindPoint = Readonly<{
  sha: string;
  turnId: string;
  messageCount: number;
  sequence: string;
}>;

/**
 * Serializes checkpoints for `runtimeMetadata`. The session JSON column cannot
 * hold bigints, and `loadRewindPoints` reads `sequence` back as a string, so
 * every writer must go through this to keep the round-trip lossless.
 */
const serializeRewindPoints = (
  points: ReadonlyArray<RewindPoint>,
): ReadonlyArray<SerializedRewindPoint> =>
  points.map((point) => ({
    messageCount: point.messageCount,
    sequence: point.sequence.toString(),
    sha: point.sha,
    turnId: point.turnId,
  }));

type ReplyFn = (message: AgentServerMessage) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMessageContent = (value: unknown): value is Conversation.Message["content"] =>
  typeof value === "string" || (Array.isArray(value) && value.every((item) => isRecord(item)));

const isThinkingBlock = (value: unknown): value is Conversation.ThinkingBlock =>
  isRecord(value) && typeof value.thinking === "string" && typeof value.signature === "string";

const isToolUseBlock = (value: unknown): value is Conversation.ToolUseBlock =>
  isRecord(value) &&
  typeof value.toolUseId === "string" &&
  typeof value.toolName === "string" &&
  isRecord(value.arguments);

const isToolResultBlock = (value: unknown): value is Conversation.ToolResultBlock =>
  isRecord(value) &&
  typeof value.toolUseId === "string" &&
  isMessageContent(value.content) &&
  typeof value.isError === "boolean";

const isMessage = (value: unknown): value is Conversation.Message => {
  if (
    !isRecord(value) ||
    (value.role !== "user" && value.role !== "assistant" && value.role !== "system") ||
    !isMessageContent(value.content) ||
    (value.role !== "user" && typeof value.content !== "string")
  ) {
    return false;
  }
  if (
    value.thinkingBlocks !== undefined &&
    (!Array.isArray(value.thinkingBlocks) || !value.thinkingBlocks.every(isThinkingBlock))
  ) {
    return false;
  }
  if (
    value.toolUses !== undefined &&
    (!Array.isArray(value.toolUses) || !value.toolUses.every(isToolUseBlock))
  ) {
    return false;
  }
  return (
    value.toolResults === undefined ||
    (Array.isArray(value.toolResults) && value.toolResults.every(isToolResultBlock))
  );
};

export const parseSavedConversationMessages = (context: unknown): Conversation.Message[] | null => {
  if (!isRecord(context) || !Array.isArray(context.messages)) return null;
  return context.messages.every(isMessage) ? context.messages : null;
};

const parseSavedActiveSkills = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [];

const isWrappedSystemReminder = (message: Conversation.Message): boolean =>
  message.role === "user" &&
  typeof message.content === "string" &&
  message.content.startsWith("<system-reminder>") &&
  message.content.endsWith("</system-reminder>");

const toYukinoMode = (mode: AgentPermissionMode): Permissions.PermissionMode => {
  switch (mode) {
    case "DEFAULT":
      return "default";
    case "ACCEPT_EDITS":
      return "acceptEdits";
    case "PLAN":
      return "plan";
    default:
      return "bypassPermissions";
  }
};

/**
 * Local-git adaptation of the library's /review prompt: the upstream
 * Commands.Prompts.buildReviewPrompt targets GitHub PRs through `gh`, while
 * codegen workspaces are local repositories, so the scope defaults to the
 * uncommitted working tree and free-form args select refs or focus.
 */
const buildReviewPrompt = (args: string): string => {
  const scope =
    args.trim().length > 0
      ? args.trim()
      : "the uncommitted working tree changes (collect them with `git status --porcelain` and `git diff HEAD`)";
  return [
    `You are an expert code reviewer. Review ${scope} in this repository.`,
    "",
    "1. Collect the changes with git (e.g. `git diff <from>..<to>`, `git show <commit>`, or `git diff HEAD` for the working tree).",
    "2. Read the surrounding code and project instructions to understand the changes in context.",
    "3. Provide a concise but thorough review covering what the changes do, code correctness, project conventions, performance, test coverage, and security. Report specific issues with file paths and line numbers, explain their impact, and suggest improvements. State any limitations or checks you could not complete.",
    "",
    "Use clear sections and bullet points. Review only: do not modify files or run destructive commands. Return your findings directly as Markdown.",
  ].join("\n");
};

export type RunTurnInput = Readonly<{
  requestId: string;
  turnId: string;
  input: string;
  selectedElement?: Record<string, unknown>;
  previewError?: string;
  /** Multi-user attribution: the session user that submitted this turn. */
  actorUserId?: string;
  /** Set when the text was already persisted as a steered user_message. */
  persistedAsSteering?: boolean;
}>;

/** Live subagent/fork activity, mirrors Remote.Server.RemoteSubagentEvent folding. */
type SubagentActivity = {
  toolCallId: string;
  role: string;
  background: boolean;
  turnCount: number;
  activeTools: Array<{ toolId: string; toolName: string }>;
  status: "running" | "completed" | "failed" | "stopped";
};

export type AgentRuntimeDeps = Readonly<{
  workspace: AgentWorkspaceModel;
  appId: bigint;
  workDir: string;
  stores: AgentStores;
  git: GitRuntime;
  metrics: MetricsService;
  /** Process-wide admission control shared by every runtime (multi-user cap). */
  turnGate?: TurnGate;
  /** Hard cap on simultaneous WS connections watching this workspace. */
  maxConnections?: number;
  /** A RUNNING session untouched for this long can be reclaimed by any node. */
  claimStaleMs?: number;
}>;

const toEventMessage = (row: AgentTranscriptEventModel): AgentTranscriptEventMessage => ({
  createdAt: row.createTime.toISOString(),
  kind: row.kind,
  payload: row.payload,
  sequence: row.sequence.toString(),
  sessionId: row.sessionId,
  ...(row.turnId !== null && { turnId: row.turnId }),
});

export class AgentRuntime {
  readonly appId: bigint;
  readonly workspaceId: bigint;
  private readonly workDir: string;
  private readonly stores: AgentStores;
  private readonly git: GitRuntime;
  private readonly metrics: MetricsService;
  private readonly broker: InteractionBroker;
  private readonly lock = new AsyncLock();
  private readonly connections = new Set<AgentConnection>();
  private readonly mcpAnnounced = new Set<string>();
  private readonly turnGate: TurnGate;
  private readonly maxConnections: number;
  private readonly claimStaleMs: number;

  private workspace: AgentWorkspaceModel;
  private handlePromise: Promise<Remote.Server.RemoteAgentHandle> | undefined;
  private sessionPromise: Promise<string> | undefined;
  private disposePromise: Promise<void> | undefined;
  private sessionId = "";
  private sequence = 0n;
  private currentAbort: AbortController | undefined;
  private currentTurnId: string | null = null;
  private lastActivityMs = Date.now();
  private activeTaskCount = 0;
  private disposing = false;

  /** Agent instance driving the in-flight loop; steering target (Remote parity). */
  private currentAgent: Agent.Agent | null = null;
  /** Set by abort() so steering leftovers are dropped, not replayed. */
  private runCanceled = false;
  /** Messages queued while a turn ran but steering was unavailable. */
  private followUps: RunTurnInput[] = [];
  /** Resolved handle mirror for synchronous access paths. */
  private resolvedHandle: Remote.Server.RemoteAgentHandle | null = null;
  /** Cursor-based background memory extraction/consolidation (Remote parity). */
  private memoryTasks: MemoryMaintenanceTasks | null = null;
  /** Live subagent/fork activity keyed by toolCallId (Remote parity). */
  private readonly subagentStates = new Map<string, SubagentActivity>();
  private activityAttached = false;
  private unsubscribeTasks: (() => void) | null = null;
  private wakeupTimer: NodeJS.Timeout | null = null;
  private teammateTimer: NodeJS.Timeout | null = null;
  private teammateSignature = "";

  // Plan-mode state (RemoteServer parity).
  private planFilePath = "";
  private prePlanPermissionMode: AgentPermissionMode | null = null;
  private hasExitedPlanMode = false;
  private exitPlanSucceeded = false;
  private planApprovalPending = false;
  private planApprovalTimer: NodeJS.Timeout | null = null;
  private pendingPlanExecution: string | null = null;

  // Controllers for auxiliary flows that abort() must cancel.
  private modelListController: AbortController | null = null;
  private reviewController: AbortController | null = null;
  private forkController: AbortController | null = null;
  private userBashController: AbortController | null = null;

  /** @-mention completion cache (Remote parity: 30s TTL). */
  private fileCache: { key: string; files: string[]; scannedAt: number } | null = null;
  /** Last usage snapshot; feeds the ready payload between runs. */
  private lastUsage = { inputTokens: 0, outputTokens: 0 };
  /** Lazily created OS sandbox for /sandbox toggling (Remote parity). */
  private sandbox: Promise<Sandbox.Sandbox | null> | null = null;

  constructor(deps: AgentRuntimeDeps) {
    this.appId = deps.appId;
    this.workspaceId = deps.workspace.id;
    this.workspace = deps.workspace;
    this.workDir = deps.workDir;
    this.stores = deps.stores;
    this.git = deps.git;
    this.metrics = deps.metrics;
    this.broker = createInteractionBroker(deps.stores, undefined, (interactionId) => {
      // Remote request_expired parity: tell watchers the dialog is dead so the
      // UI does not keep a stale permission/question prompt open.
      this.broadcast({
        interactionId,
        outcome: "expired",
        sessionId: this.sessionId,
        type: "interaction_resolved",
      });
    });
    this.turnGate = deps.turnGate ?? new TurnGate(env.AGENT_MAX_CONCURRENT_TURNS);
    this.maxConnections = deps.maxConnections ?? env.AGENT_MAX_CONNECTIONS_PER_WORKSPACE;
    this.claimStaleMs = deps.claimStaleMs ?? env.AGENT_TURN_CLAIM_STALE_MS;
  }

  get lastActivity(): number {
    return this.lastActivityMs;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get isBusy(): boolean {
    return this.activeTaskCount > 0 || this.currentTurnId !== null || this.broker.hasPending();
  }

  private markActivity(): void {
    this.lastActivityMs = Date.now();
  }

  private assertAcceptingTasks(): void {
    if (this.disposing) throw new Error("Agent runtime is disposing");
  }

  private runLockedTask<T>(task: () => Promise<T>): Promise<T> {
    this.assertAcceptingTasks();
    this.activeTaskCount += 1;
    const result = this.lock.run(async () => {
      this.assertAcceptingTasks();
      return task();
    });
    return result.finally(() => {
      this.activeTaskCount -= 1;
    });
  }

  private broadcast(message: AgentServerMessage): void {
    for (const connection of this.connections) {
      try {
        connection.send(message);
      } catch {}
    }
  }

  private ensureSession(): Promise<string> {
    this.assertAcceptingTasks();
    if (this.sessionId.length > 0) return Promise.resolve(this.sessionId);
    if (this.sessionPromise !== undefined) return this.sessionPromise;
    const sessionPromise = this.initializeSession();
    this.sessionPromise = sessionPromise;
    void sessionPromise.catch(() => {
      if (this.sessionPromise === sessionPromise) this.sessionPromise = undefined;
    });
    return sessionPromise;
  }

  private async initializeSession(): Promise<string> {
    const currentId = this.workspace.currentSessionId;
    if (currentId !== null) {
      const existing = await this.stores.sessions.findById(currentId);
      if (existing !== null) {
        await this.stores.interactions.cancelPending(existing.id);
        if (existing.status !== "COMPLETED" && existing.status !== "ABORTED") {
          if (existing.status !== "IDLE") {
            await this.stores.sessions.updateStatus(existing.id, "IDLE");
          }
          this.sessionId = existing.id;
          this.sequence = existing.lastEventSequence;
          return this.sessionId;
        }
      }
    }
    const session = await this.stores.sessions.createAndSetCurrent(this.workspaceId);
    this.workspace = { ...this.workspace, currentSessionId: session.id };
    this.sessionId = session.id;
    this.sequence = session.lastEventSequence;
    return this.sessionId;
  }

  private async ensureHandle(): Promise<Remote.Server.RemoteAgentHandle> {
    this.assertAcceptingTasks();
    if (this.handlePromise !== undefined) return this.handlePromise;
    this.handlePromise = this.createHandle().catch((error: unknown) => {
      this.handlePromise = undefined;
      throw error;
    });
    return this.handlePromise;
  }

  private async createHandle(): Promise<Remote.Server.RemoteAgentHandle> {
    await mkdir(this.workDir, { recursive: true });
    const [mcpRows, hookRows] = await Promise.all([
      this.stores.mcp.listEnabled(this.workspaceId),
      this.workspace.hooksEnabled
        ? this.stores.hooks.listEnabled(this.workspaceId)
        : Promise.resolve([]),
    ]);
    const provider = buildProviderConfig(
      env,
      this.workspace.modelOverride,
      this.workspace.thinkingLevel,
    );
    const handle = await Remote.Server.createRemoteAgent({
      askUser: this.askUser,
      cwd: this.workDir,
      enableCoordinatorMode: false,
      // Remote parity: registers EnterPlanMode/ExitPlanMode so the model can
      // drive the plan-approval flow from the browser.
      enableModelPlanMode: true,
      forkDisabled: false,
      hooks: buildHookConfigs(hookRows),
      mcpServers: mcpRows.map(toYukinoMcpConfig),
      // Gates the startup long-term-memory injection; per-turn injection and
      // maintenance follow the live workspace setting (it can toggle at
      // runtime through applySoftSettings without recreating the handle).
      memoryEnabled: this.workspace.memoryEnabled,
      provider,
      ...(this.workspace.sandboxEnabled && {
        sandboxConfig: {
          auto_allow: this.workspace.sandboxAutoAllow,
          enabled: true,
          network_enabled: true,
        },
      }),
      onSubagentEvent: (event) => {
        this.handleSubagentEvent(event);
      },
    });
    handle.checker.sandboxAutoAllow = this.workspace.sandboxAutoAllow;
    await this.rehydrate(handle);
    this.resolvedHandle = handle;
    this.attachActivityBridge(handle);
    return handle;
  }

  private async rehydrate(handle: Remote.Server.RemoteAgentHandle): Promise<void> {
    const sessionId = await this.ensureSession();
    const session = await this.stores.sessions.findById(sessionId);
    const savedMessages = parseSavedConversationMessages(session?.context);

    handle.conv.reset();

    if (savedMessages !== null && savedMessages.length > 0) {
      handle.conv.appendMessages(
        savedMessages.filter((message) => !isWrappedSystemReminder(message)),
      );
    } else {
      const rows = await this.stores.transcript.listRecent(sessionId, REPLAY_LIMIT);
      for (const row of rows) {
        const payload = row.payload as { text?: unknown } | null;
        const text = payload !== null && typeof payload.text === "string" ? payload.text : "";
        if (text.length === 0) continue;
        if (row.kind === "user_message") handle.conv.addUserMessage(text);
        else if (row.kind === "assistant_message") handle.conv.addAssistantFull(text, [], []);
      }
    }

    if (handle.skillCatalog !== null) {
      for (const name of parseSavedActiveSkills(session?.activeSkills)) {
        const skill = handle.skillCatalog.get(name);
        if (skill !== undefined) handle.activeSkills.set(name, skill.body);
      }
    }
  }

  private readonly askUser: Tools.AskUser.Asker = async (questions: Tools.AskUser.Question[]) => {
    this.assertAcceptingTasks();
    const sessionId = this.sessionId;
    const { answers, interactionId } = await this.broker.requestQuestions({
      questions,
      sessionId,
      turnId: this.currentTurnId,
    });
    this.broadcast({
      interactionId,
      questions,
      sessionId,
      type: "question_request",
      ...(this.currentTurnId !== null && { turnId: this.currentTurnId }),
    });
    this.broadcast({ status: "waiting", type: "runtime_status", sessionId });
    try {
      return await answers;
    } finally {
      this.broadcast({ status: "running", type: "runtime_status", sessionId });
    }
  };

  private buildPermissionCallback(checker: Permissions.PermissionChecker, turnId: string) {
    return async (
      toolName: string,
      args: Record<string, unknown>,
      decision: Permissions.Decision,
      _toolCallId: string,
      signal?: AbortSignal,
    ): Promise<PermissionDecision> => {
      if (this.disposing) return "deny";
      const description = checker.describeToolAction(toolName, args);
      const { decision: pending, interactionId } = await this.broker.requestPermission({
        payload: toPermissionPayload(toolName, args, decision, description),
        sessionId: this.sessionId,
        turnId,
      });
      this.broadcast({
        interactionId,
        request: { args, description, reason: decision.reason, toolName },
        sessionId: this.sessionId,
        turnId,
        type: "permission_request",
      });
      this.broadcast({
        sessionId: this.sessionId,
        status: "waiting",
        turnId,
        type: "runtime_status",
      });
      // RemoteServer.createPermissionCallback parity: aborting a run cannot
      // settle a promise owned by the broker, so deny explicitly — otherwise
      // the workspace stays "busy" (and the loop stays blocked) until the
      // broker timeout expires.
      const cancel = (): void => {
        void this.broker
          .resolvePermission(interactionId, "deny")
          .then((resolved) => {
            if (!resolved) return;
            this.broadcast({
              interactionId,
              outcome: "denied",
              sessionId: this.sessionId,
              type: "interaction_resolved",
            });
          })
          .catch(() => undefined);
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      try {
        return await pending;
      } finally {
        signal?.removeEventListener("abort", cancel);
        this.broadcast({
          sessionId: this.sessionId,
          status: "running",
          turnId,
          type: "runtime_status",
        });
      }
    };
  }

  private async emitPersist(
    turnId: string | null,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.stores.transcript.appendNext({
      kind,
      payload,
      sessionId: this.sessionId,
      turnId,
    });
    if (row.sequence > this.sequence) this.sequence = row.sequence;
    this.broadcast({ event: toEventMessage(row), type: "event" });
  }

  private async setStatus(status: AgentSessionStatus, completed = false): Promise<void> {
    await this.stores.sessions.updateStatus(this.sessionId, status, completed);
  }

  /**
   * Registers a WS connection. Returns false when the per-workspace cap is
   * reached (multi-user guard: one viral app page must not exhaust the
   * server's socket budget), so the caller can close with 1013.
   */
  addConnection(connection: AgentConnection): boolean {
    this.markActivity();
    if (this.connections.size >= this.maxConnections) return false;
    this.connections.add(connection);
    return true;
  }

  removeConnection(connection: AgentConnection): void {
    this.connections.delete(connection);
  }

  touch(): void {
    this.markActivity();
  }

  async runExclusive<T>(task: (workDir: string) => Promise<T>): Promise<T> {
    this.markActivity();
    try {
      return await this.runLockedTask(() => task(this.workDir));
    } finally {
      // A message queued while this exclusive task held the lock must not
      // strand: kick the follow-up drain once the lock frees up.
      void this.drainFollowUps().catch(() => undefined);
    }
  }

  notifyFilesChanged(paths: readonly string[]): void {
    this.broadcast({ paths: [...paths], type: "files_changed" });
  }

  private async currentHighWatermark(sessionId: string): Promise<bigint> {
    const persisted = await this.stores.sessions.findById(sessionId);
    const highWatermark =
      persisted !== null && persisted !== undefined && persisted.lastEventSequence > this.sequence
        ? persisted.lastEventSequence
        : this.sequence;
    this.sequence = highWatermark;
    return highWatermark;
  }

  async ready(connection: AgentConnection): Promise<void> {
    const sessionId = await this.ensureSession();
    const highWatermark = await this.currentHighWatermark(sessionId);
    const pendingInteractions = this.broker.snapshot(sessionId);
    const handle = this.resolvedHandle;
    connection.send({
      currentTurnId: this.currentTurnId,
      highWatermark: highWatermark.toString(),
      pendingInteractions,
      permissionMode: this.workspace.permissionMode,
      readOnly: connection.readOnly,
      runtimeStatus:
        this.currentTurnId === null
          ? "idle"
          : pendingInteractions.length > 0
            ? "waiting"
            : "running",
      sessionId,
      type: "ready",
      // Live snapshot (RemoteServer sendUsageSnapshot/statusPayload parity).
      contextTokens: handle !== null ? Compact.Compact.currentContextTokens(handle.conv) : 0,
      contextWindow: handle?.contextWindow ?? 0,
      hooksEnabled: this.workspace.hooksEnabled,
      memoryEnabled: this.workspace.memoryEnabled,
      model: handle?.provider.model ?? this.workspace.modelOverride ?? env.AI_MODEL,
      planApprovalPending: this.planApprovalPending,
      sandboxAutoAllow: this.workspace.sandboxAutoAllow,
      sandboxEnabled: this.workspace.sandboxEnabled,
      thinkingLevel:
        handle?.client.getThinkingLevel?.() ??
        this.workspace.thinkingLevel ??
        Config.Constants.DEFAULT_THINKING_LEVEL,
    });
    // Prompt history for composer up/down navigation (Remote parity), derived
    // from the persisted transcript so it survives reconnects and restarts.
    // Best-effort: a history failure must never block the ready handshake.
    try {
      const rows = await this.stores.transcript.listRecent(sessionId, HISTORY_LIMIT);
      const entries: string[] = [];
      for (const row of rows) {
        if (row.kind !== "user_message") continue;
        const payload = row.payload as { text?: unknown } | null;
        if (payload !== null && typeof payload.text === "string" && payload.text.length > 0) {
          entries.push(payload.text);
        }
      }
      connection.send({ entries, type: "history" });
    } catch {
      // History is a convenience; skip it when the store is unavailable.
    }
    // A late-joining watcher must see an open plan approval (Remote parity).
    if (this.planApprovalPending) {
      connection.send(this.planApprovalMessage());
    }
  }

  async sendBacklog(connection: AgentConnection, afterSequence: bigint): Promise<void> {
    const sessionId = await this.ensureSession();
    const highWatermark = await this.currentHighWatermark(sessionId);
    let cursor = afterSequence;

    while (true) {
      const rows = await this.stores.transcript.listAfter(
        sessionId,
        cursor,
        highWatermark,
        BACKLOG_BATCH_SIZE,
      );
      const nextCursor = rows.at(-1)?.sequence ?? cursor;
      const complete = rows.length === 0 || nextCursor >= highWatermark;
      connection.send({
        complete,
        events: rows.map(toEventMessage),
        highWatermark: highWatermark.toString(),
        sessionId,
        type: "transcript_batch",
      });
      if (complete) return;
      cursor = nextCursor;
    }
  }

  applySoftSettings(patch: {
    permissionMode?: AgentPermissionMode;
    sandboxEnabled?: boolean;
    sandboxAutoAllow?: boolean;
    memoryEnabled?: boolean;
  }): void {
    const previousMode = this.workspace.permissionMode;
    this.workspace = {
      ...this.workspace,
      ...(patch.permissionMode !== undefined && {
        permissionMode: patch.permissionMode,
      }),
      ...(patch.sandboxEnabled !== undefined && {
        sandboxEnabled: patch.sandboxEnabled,
      }),
      ...(patch.sandboxAutoAllow !== undefined && {
        sandboxAutoAllow: patch.sandboxAutoAllow,
      }),
      ...(patch.memoryEnabled !== undefined && {
        memoryEnabled: patch.memoryEnabled,
      }),
    };
    // RemoteServer.applyPermissionMode parity: plan entry/exit carry reminders.
    if (patch.permissionMode !== undefined && patch.permissionMode !== previousMode) {
      if (patch.permissionMode === "PLAN") {
        this.prePlanPermissionMode = previousMode;
        void this.enterPlanMode().catch(() => undefined);
      } else if (previousMode === "PLAN") {
        this.hasExitedPlanMode = true;
        this.resolvedHandle?.conv.addSystemReminder(
          Prompt.PlanMode.buildPlanModeExitReminder(
            this.planFilePath,
            this.planFilePath.length > 0 &&
              PlanFile.planExists({ planFilePath: this.planFilePath }),
          ),
        );
      }
      this.broadcast({ mode: this.workspace.permissionMode, type: "permission_mode" });
    }
    this.broadcast({
      sessionId: this.sessionId,
      status: "idle",
      type: "runtime_status",
      detail: `permissionMode=${this.workspace.permissionMode}`,
    });
  }

  abort(): void {
    // Remote parity: a cancel drops queued follow-ups and steering leftovers
    // instead of replaying them after the aborted loop.
    this.runCanceled = true;
    this.followUps = [];
    this.pendingPlanExecution = null;
    this.planApprovalPending = false;
    if (this.planApprovalTimer !== null) {
      clearTimeout(this.planApprovalTimer);
      this.planApprovalTimer = null;
    }
    this.currentAbort?.abort();
    this.modelListController?.abort();
    this.reviewController?.abort();
    this.forkController?.abort();
    this.userBashController?.abort();
    // RemoteServer.cancelActiveRun parity: settle broker-owned waits so an
    // abort during a permission/question prompt frees the workspace at once.
    if (this.sessionId.length > 0 && this.broker.hasPending()) {
      const pending = this.broker.snapshot(this.sessionId);
      void this.broker
        .cancelSession(this.sessionId)
        .then(() => {
          for (const item of pending) {
            this.broadcast({
              interactionId: item.interactionId,
              outcome: "cancelled",
              sessionId: this.sessionId,
              type: "interaction_resolved",
            });
          }
        })
        .catch(() => undefined);
    }
    void this.handlePromise
      ?.then((handle) =>
        Promise.allSettled([handle.backgroundTaskManager.stopAll(), handle.teamManager.stopAll()]),
      )
      .catch(() => undefined);
  }

  /**
   * Single entry point for WS `run` messages. While the workspace is busy the
   * input becomes steering for the in-flight loop (or a queued follow-up when
   * it cannot steer); idle input runs as a turn, with slash commands routed
   * to handleCommand. Mirrors RemoteServer.handleUserMessage.
   */
  async submit(input: RunTurnInput): Promise<void> {
    if (this.isBusy) {
      await this.steerOrQueue(input);
      return;
    }
    const text = input.input.trim();
    const userBash = Conversation.UserBash.parseUserBashCommand(text);
    if (userBash !== null) {
      await this.runUserBash(
        userBash.command,
        userBash.excludeFromContext,
        input.requestId,
        input.actorUserId,
      );
    } else if (text.startsWith("/") && parseCommand(text) !== null) {
      await this.handleCommand(text, input.requestId, input.actorUserId);
    } else {
      await this.runTurn(input);
    }
    // Remote parity: an approved plan executes once the slot frees up.
    if (this.pendingPlanExecution !== null) {
      const plan = this.pendingPlanExecution;
      this.pendingPlanExecution = null;
      await this.submit({ input: plan, requestId: randomUUID(), turnId: randomUUID() });
    }
    await this.drainFollowUps();
  }

  /** Steers the active loop, or queues a follow-up when steering is impossible. */
  private async steerOrQueue(input: RunTurnInput): Promise<void> {
    const text = input.input.trim();
    if (text.length === 0) return;
    // Slash and Bash commands run as follow-ups instead of model steering.
    const isCommand =
      (text.startsWith("/") && parseCommand(text) !== null) ||
      Conversation.UserBash.parseUserBashCommand(text) !== null;
    // A cancel sets `runCanceled` before the aborted loop's `finally` clears
    // `currentAgent`/`currentTurnId`. Steering into that dying loop would be
    // persisted as a user_message yet discarded with the drained leftovers,
    // silently dropping the message. Queue it as a follow-up instead so the
    // post-abort drain (submit / notification / drain loop) replays it.
    if (!isCommand && this.currentAgent !== null && !this.runCanceled) {
      this.currentAgent.steer(text);
      await this.emitPersist(this.currentTurnId, "user_message", {
        steered: true,
        text,
        ...(input.actorUserId !== undefined && { actorUserId: input.actorUserId }),
      });
      this.broadcast({
        payload: { phase: "steering_queued", text },
        type: "agent_status",
      });
      return;
    }
    this.followUps.push(input);
    this.broadcast({
      payload: { phase: "followup_queued", text },
      type: "agent_status",
    });
    // The active turn may have ended between the busy check and the queue
    // push; its own drain might already have exited, so kick a fresh one.
    void this.drainFollowUps().catch(() => undefined);
  }

  /** Replays queued follow-ups once the workspace is idle (Remote parity). */
  private async drainFollowUps(): Promise<void> {
    while (!this.disposing && !this.isBusy && this.followUps.length > 0) {
      const next = this.followUps.shift();
      if (next === undefined) break;
      const text = next.input.trim();
      this.broadcast({
        payload: { phase: "followup_started", text },
        type: "agent_status",
      });
      const userBash = Conversation.UserBash.parseUserBashCommand(text);
      if (userBash !== null) {
        await this.runUserBash(
          userBash.command,
          userBash.excludeFromContext,
          next.requestId,
          next.actorUserId,
        );
      } else if (text.startsWith("/") && parseCommand(text) !== null) {
        await this.handleCommand(text, next.requestId, next.actorUserId);
      } else {
        await this.runTurn(next);
      }
    }
  }

  /** Ctrl+B parity: move running foreground shells to the background. */
  backgroundForegroundShells(): number {
    this.markActivity();
    const handle = this.resolvedHandle;
    if (handle === null || !Tools.ShellBackground.hasAnyForegroundTasks(handle.registry)) {
      return 0;
    }
    const count = Tools.ShellBackground.backgroundAllForegroundTasks(handle.registry);
    this.broadcast({
      payload: { count, phase: "background_shells" },
      type: "agent_status",
    });
    return count;
  }

  async runTurn(input: RunTurnInput): Promise<void> {
    await this.runLockedTask(() => this.executeTurn(input));
  }

  /**
   * Remote-parity wakeup: background tasks and teammates only deliver their
   * notifications inside a loop, so an idle runtime starts a notification-only
   * turn (no user message) as soon as something is pending.
   */
  private async runNotificationTurn(): Promise<void> {
    if (this.disposing || this.isBusy) return;
    const handle = this.resolvedHandle;
    if (handle === null) return;
    if (
      !handle.teamManager.hasLeaderNotifications() &&
      !handle.backgroundTaskManager.hasNotifications()
    ) {
      return;
    }
    await this.runLockedTask(async () => {
      if (this.disposing || this.currentTurnId !== null) return;
      await this.executeTurn(null);
    });
    await this.drainFollowUps();
  }

  /** Run-equivalent tool visibility, mirrors Remote's composeAgentToolFilter. */
  private composeToolFilter(handle: Remote.Server.RemoteAgentHandle): (name: string) => boolean {
    const coordinatorFilter = Teams.Coordinator.coordinatorToolFilter(false);
    return (name) =>
      coordinatorFilter(name) && (handle.toolFilter !== null ? handle.toolFilter(name) : true);
  }

  /**
   * Runs one agent loop. `null` input runs a notification-only turn: nothing
   * is appended to the conversation, the loop just drains pending background
   * task / teammate notifications (RemoteServer.runNotificationTurn parity).
   */
  private async executeTurn(input: RunTurnInput | null): Promise<void> {
    this.markActivity();
    const handle = await this.ensureHandle();
    const sessionId = await this.ensureSession();
    const turnId = input?.turnId ?? randomUUID();
    this.currentTurnId = turnId;
    this.runCanceled = false;
    this.exitPlanSucceeded = false;
    const abort = new AbortController();
    this.currentAbort = abort;
    let claimed = false;

    try {
      if (input !== null) {
        // Remote parity: a fresh user turn resets the activity panel; running
        // subagents re-announce themselves through their lifecycle events.
        this.subagentStates.clear();
        this.broadcast({
          action: "state",
          payload: { list: [] },
          type: "subagent",
        });
      }
      if (input !== null && input.persistedAsSteering !== true) {
        await this.emitPersist(turnId, "user_message", {
          text: input.input,
          ...(input.actorUserId !== undefined && { actorUserId: input.actorUserId }),
          ...(input.selectedElement !== undefined && {
            selectedElement: input.selectedElement,
          }),
          ...(input.previewError !== undefined && {
            previewError: input.previewError,
          }),
        });
      }

      // Cross-instance turn mutex (multi-node deployments share one database):
      // only the node that flips IDLE -> RUNNING may drive the workspace, and
      // a RUNNING row untouched for claimStaleMs is reclaimable after a crash.
      claimed = await this.stores.sessions.claimTurn(
        sessionId,
        new Date(Date.now() - this.claimStaleMs),
      );
      if (!claimed) {
        // A lost claim on a notification turn just means another node owns the
        // workspace right now; only user-initiated turns report the conflict.
        if (input !== null) {
          this.broadcast({
            code: "workspace_busy",
            message: "Another agent turn is already running for this workspace",
            recoverable: true,
            requestId: input.requestId,
            type: "error",
          });
        }
        return;
      }
      this.broadcast({
        sessionId,
        status: "running",
        turnId,
        type: "runtime_status",
      });

      const adapter = createEventAdapter();
      const checker = new Permissions.PermissionChecker(
        this.workDir,
        toYukinoMode(this.workspace.permissionMode),
      );
      checker.sandboxEnabled = this.workspace.sandboxEnabled;
      checker.sandboxAutoAllow = this.workspace.sandboxAutoAllow;
      // The checker is rebuilt per turn; carry the plan file across turns so
      // ExitPlanMode writes and the approval dialog read the same path.
      checker.planFilePath = this.planFilePath;

      if (input !== null) {
        // @-refs expand exactly like the terminal/Remote: the transcript keeps
        // the raw text while the conversation stores the expansion (inlined
        // file contents and image blocks).
        const expanded = await Conversation.AtExpand.expandAtRefsWithImages(
          this.composePrompt(input),
          this.workDir,
        );
        handle.conv.addUserMessage(expanded);
      }

      if (handle.mcpManager !== null) {
        MCP.Instructions.syncMcpInstructions(handle.conv, this.mcpAnnounced, handle.mcpManager);
      }

      const skillSection =
        handle.skillCatalog !== null ? Skills.Prompts.buildSkillSection(handle.skillCatalog) : "";

      const agent = new Agent.Agent({
        abortSignal: abort.signal,
        activeSkills: handle.activeSkills,
        checker,
        client: handle.client,
        contextWindow: handle.contextWindow,
        conversation: handle.conv,
        coordinatorActiveFn: () => Teams.Coordinator.coordinatorActive(false),
        fileHistory: handle.fileHistory,
        fileStateCache: handle.fileStateCache,
        ...(handle.goalManager !== undefined && { goalManager: handle.goalManager }),
        // Function form (Remote parity): re-read the current instructions and
        // memory index at each (re)injection instead of snapshotting them at
        // handle creation, so edits and runtime toggles survive compaction.
        instructions: () => Memory.Instructions.loadInstructions(handle.cwd),
        maxIterations: env.AI_MAX_ITERATIONS,
        maxOutput: Config.ProviderConfig.getMaxOutputTokens(handle.provider),
        memoryContent: () =>
          this.workspace.memoryEnabled ? handle.memoryManager.buildSystemReminder() : "",
        notificationFn: () => [
          ...handle.teamManager.drainLeaderMailbox(),
          ...handle.backgroundTaskManager
            .drainNotifications()
            .map(Subagent.Prompts.formatAgentTaskNotification),
        ],
        onPermissionRequest: this.buildPermissionCallback(checker, turnId),
        recoveryState: handle.recoveryState,
        registry: handle.registry,
        sessionId: "",
        skillSection,
        skillDeltaFn: () => {
          const section =
            handle.skillCatalog !== null
              ? Skills.Prompts.buildSkillSection(handle.skillCatalog)
              : "";
          return section.length > 0 && !handle.conv.hasReminderContaining(section) ? section : "";
        },
        cwd: this.workDir,
        toolFilter: this.composeToolFilter(handle),
        ...(this.workspace.hooksEnabled &&
          handle.hookEngine !== null && { hookEngine: handle.hookEngine }),
        ...(this.workspace.memoryEnabled && {
          onLoopComplete: (conv) => this.runMemoryMaintenance(handle, conv),
        }),
      });

      this.currentAgent = agent;
      // Global admission control: at most AGENT_MAX_CONCURRENT_TURNS agent
      // loops run across every workspace on this node (multi-user guard).
      // The abort signal keeps a canceled turn from blocking on a free slot.
      const release = await this.turnGate.acquire(abort.signal, input?.actorUserId);
      try {
        for await (const event of agent.run()) {
          await this.dispatchEvent(turnId, adapter, event);
          if (event.type === "tool_result" && !event.isError) {
            if (event.toolName === "ExitPlanMode") this.exitPlanSucceeded = true;
          }
          if (event.type === "usage") {
            this.lastUsage = {
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
            };
            this.broadcast({
              contextTokens: Compact.Compact.currentContextTokens(handle.conv),
              contextWindow: handle.contextWindow,
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              type: "usage",
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent run failed";
        await this.emitPersist(turnId, "error", { message });
        this.broadcast({
          code: "agent_error",
          message,
          recoverable: true,
          type: "error",
          ...(input !== null && { requestId: input.requestId }),
        });
      } finally {
        release();
      }

      // Plan approval gate (Remote parity): after a plan-mode run where
      // ExitPlanMode succeeded, ask the user to approve the written plan.
      if (this.workspace.permissionMode === "PLAN" && this.exitPlanSucceeded) {
        this.broadcastPlanApprovalRequest();
      }

      await this.finalizeTurn(handle, turnId, adapter);
    } catch (error) {
      // Infrastructure failure (init, persistence, claim): never leave the
      // session pinned RUNNING, or the workspace stays blocked for claimStaleMs.
      const message = error instanceof Error ? error.message : "Agent turn failed";
      if (claimed) {
        await this.setStatus("IDLE").catch(() => undefined);
      }
      this.broadcast({
        code: "turn_failed",
        message,
        recoverable: true,
        type: "error",
        ...(input !== null && { requestId: input.requestId }),
      });
    } finally {
      // Steering queued too late for in-loop delivery becomes follow-up turns
      // (Remote parity), unless the run was canceled.
      const leftovers = this.currentAgent?.drainSteering() ?? [];
      this.currentAgent = null;
      this.currentAbort = undefined;
      this.currentTurnId = null;
      if (!this.runCanceled) {
        for (let index = leftovers.length - 1; index >= 0; index -= 1) {
          const leftover = leftovers[index];
          if (leftover === undefined) continue;
          this.followUps.unshift({
            input: leftover.text,
            persistedAsSteering: true,
            requestId: randomUUID(),
            turnId: randomUUID(),
          });
        }
      }
    }
  }

  private composePrompt(input: RunTurnInput): string {
    let text = input.input;
    if (input.selectedElement !== undefined) {
      text += `\n\n<selected-element>\n${JSON.stringify(input.selectedElement)}\n</selected-element>`;
    }
    if (input.previewError !== undefined && input.previewError.length > 0) {
      text += `\n\n<preview-error>\n${input.previewError}\n</preview-error>`;
    }
    return text;
  }

  private async dispatchEvent(
    turnId: string,
    adapter: ReturnType<typeof createEventAdapter>,
    event: Agent.Events.AgentEvent,
  ): Promise<void> {
    for (const output of adapter.mapEvent(event)) {
      if (output.persist) {
        await this.emitPersist(turnId, output.kind, output.payload);
      } else {
        this.broadcast(output.message);
      }
    }
  }

  private runMemoryMaintenance(
    handle: Remote.Server.RemoteAgentHandle,
    conv: Remote.Server.RemoteAgentHandle["conv"],
  ): void {
    // Remote BackgroundMemoryTasks parity: one cursor-tracked task set per
    // runtime, created lazily so extraction only covers the new tail and
    // in-flight LLM calls are settled on dispose.
    this.memoryTasks ??= createMemoryMaintenanceTasks(handle.client, this.workDir, (message) => {
      this.resolvedHandle?.conv.addSystemReminder(message);
    });
    this.memoryTasks.run(conv);
  }

  /**
   * Conversation checkpoints backing /rewind (Remote FileHistory parity).
   * Persisted in the session's runtimeMetadata so they survive restarts and
   * stay consistent across instances.
   */
  private async loadRewindPoints(): Promise<RewindPoint[]> {
    if (this.sessionId.length === 0) return [];
    const session = await this.stores.sessions.findById(this.sessionId);
    const raw = session?.runtimeMetadata as { rewindPoints?: unknown } | null | undefined;
    if (raw == null || !Array.isArray(raw.rewindPoints)) return [];
    const points: RewindPoint[] = [];
    for (const item of raw.rewindPoints) {
      if (
        Utils.isRecord(item) &&
        typeof item.sha === "string" &&
        typeof item.turnId === "string" &&
        typeof item.messageCount === "number" &&
        typeof item.sequence === "string"
      ) {
        try {
          points.push({
            messageCount: item.messageCount,
            sequence: BigInt(item.sequence),
            sha: item.sha,
            turnId: item.turnId,
          });
        } catch {
          // Skip malformed checkpoints.
        }
      }
    }
    return points;
  }

  private async appendRewindPoint(
    sha: string | undefined,
    turnId: string,
    handle: Remote.Server.RemoteAgentHandle,
  ): Promise<RewindPoint[]> {
    const existing = await this.loadRewindPoints();
    if (sha === undefined) return existing;
    const point: RewindPoint = {
      messageCount: handle.conv.getMessages().length,
      sequence: this.sequence,
      sha,
      turnId,
    };
    return [...existing, point].slice(-MAX_REWIND_POINTS);
  }

  private async finalizeTurn(
    handle: Remote.Server.RemoteAgentHandle,
    turnId: string,
    adapter: ReturnType<typeof createEventAdapter>,
  ): Promise<void> {
    const narration = adapter.narration();
    if (narration.length > 0) {
      await this.emitPersist(turnId, "assistant_message", {
        text: narration,
      });
    }

    const usage = adapter.usage();
    this.metrics.recordAiTokenUsage({
      modelRole: "agent",
      tokenType: "input",
      tokens: usage.input,
    });
    this.metrics.recordAiTokenUsage({
      modelRole: "agent",
      tokenType: "output",
      tokens: usage.output,
    });

    const outcome = adapter.outcome();
    let snapshotSha: string | undefined;
    if (outcome === "end_turn") {
      snapshotSha = await this.git.snapshot(this.workDir, `agent: ${turnId}`);
      this.broadcast({
        paths: [],
        type: "files_changed",
        ...(snapshotSha !== undefined && { revision: snapshotSha }),
      });
    }

    try {
      await this.stores.sessions.saveContext(this.sessionId, {
        activeSkills: [...handle.activeSkills.keys()],
        context: { messages: handle.conv.getMessages() },
        runtimeMetadata: {
          lastOutcome: outcome,
          lastTurnId: turnId,
          rewindPoints: serializeRewindPoints(
            await this.appendRewindPoint(snapshotSha, turnId, handle),
          ),
        },
      });
    } catch {}

    await this.setStatus("IDLE");
    this.broadcast({
      sessionId: this.sessionId,
      status: "idle",
      type: "runtime_status",
    });
  }

  /**
   * Wires the live activity feeds the Remote server gets from its hooks:
   * background task snapshots, teammate state polling, and the idle
   * notification wakeup that drains pending task notifications
   * (RemoteServer.attachActivityBridge parity).
   */
  private attachActivityBridge(handle: Remote.Server.RemoteAgentHandle): void {
    if (this.activityAttached) return;
    this.activityAttached = true;

    this.unsubscribeTasks = handle.backgroundTaskManager.subscribe((tasks) => {
      this.broadcast({
        action: "state",
        payload: {
          list: tasks.map((task) => ({
            id: task.id,
            kind: task.kind ?? "agent",
            name: task.name,
            status: task.status,
          })),
        },
        type: "task",
      });
    });

    this.teammateTimer = setInterval(() => {
      const current = this.resolvedHandle;
      if (current === null || this.connections.size === 0) return;
      const states = current.teamManager.getAllTeammateStates();
      const signature = JSON.stringify(states);
      if (signature === this.teammateSignature) return;
      this.teammateSignature = signature;
      this.broadcast({
        action: "state",
        payload: {
          list: states.map((state) => ({
            activeTools: state.progress.activeTools.map((tool) => ({
              toolId: tool.toolId,
              toolName: tool.toolName,
            })),
            lastMessage: state.lastMessage ?? null,
            name: state.name,
            spinnerVerb: state.spinnerVerb,
            status: state.status,
            teamName: state.teamName,
            tokenCount: state.progress.tokenCount,
            toolUseCount: state.progress.toolUseCount,
            turnCount: state.progress.turnCount,
          })),
        },
        type: "team",
      });
    }, 500);
    this.teammateTimer.unref?.();

    this.wakeupTimer = setInterval(() => {
      void this.runNotificationTurn().catch(() => undefined);
    }, 250);
    this.wakeupTimer.unref?.();
  }

  /** Folds a subagent lifecycle event into the broadcast activity state. */
  private handleSubagentEvent(ev: Remote.Server.RemoteSubagentEvent): void {
    const existing = this.subagentStates.get(ev.toolCallId);
    switch (ev.type) {
      case "started":
        this.subagentStates.set(ev.toolCallId, {
          activeTools: [],
          background: ev.background,
          role: ev.role,
          status: "running",
          toolCallId: ev.toolCallId,
          turnCount: 0,
        });
        break;
      case "tool_use":
        if (existing !== undefined) {
          existing.activeTools = [
            ...existing.activeTools.filter((tool) => tool.toolId !== ev.toolId),
            { toolId: ev.toolId, toolName: ev.toolName },
          ];
        }
        break;
      case "tool_result":
        if (existing !== undefined) {
          existing.activeTools = existing.activeTools.filter((tool) => tool.toolId !== ev.toolId);
        }
        break;
      case "turn_complete":
        if (existing !== undefined) {
          existing.activeTools = [];
          existing.turnCount += 1;
        }
        break;
      case "finished":
        if (existing !== undefined) {
          existing.activeTools = [];
          existing.status = ev.status;
        } else {
          this.subagentStates.set(ev.toolCallId, {
            activeTools: [],
            background: ev.background,
            role: ev.role,
            status: ev.status,
            toolCallId: ev.toolCallId,
            turnCount: 0,
          });
        }
        break;
    }
    this.broadcast({
      action: "state",
      payload: {
        list: [...this.subagentStates.values()].map((entry) => ({
          ...entry,
          activeTools: [...entry.activeTools],
        })),
      },
      type: "subagent",
    });
  }

  // ─────────────────────────── Plan mode (Remote parity) ───────────────────────────

  private planApprovalMessage(): AgentServerMessage {
    let planContent = "";
    try {
      if (this.planFilePath.length > 0 && existsSync(this.planFilePath)) {
        planContent = readFileSync(this.planFilePath, "utf-8");
      }
    } catch {
      /** noop */
    }
    return {
      planContent,
      planPath: this.planFilePath,
      type: "plan_approval_request",
    };
  }

  /** Sends the plan approval request with the current plan file content. */
  private broadcastPlanApprovalRequest(): void {
    this.planApprovalPending = true;
    this.broadcast(this.planApprovalMessage());
    if (this.planApprovalTimer !== null) clearTimeout(this.planApprovalTimer);
    this.planApprovalTimer = setTimeout(() => {
      this.planApprovalPending = false;
      this.planApprovalTimer = null;
      this.broadcast({
        payload: {
          message: "Plan approval expired after 10 minutes.",
          phase: "plan_approval_expired",
        },
        type: "agent_status",
      });
    }, PLAN_APPROVAL_TIMEOUT_MS);
    this.planApprovalTimer.unref?.();
  }

  private resolvePlanFilePath(): string {
    const owner: PlanFile.PlanOwner = { planFilePath: this.planFilePath };
    const path = PlanFile.getOrCreatePlanPath(owner);
    this.planFilePath = owner.planFilePath ?? path;
    return this.planFilePath;
  }

  /** Enters plan mode (RemoteServer.applyPermissionMode / /plan parity). */
  private async enterPlanMode(): Promise<string> {
    if (this.workspace.permissionMode !== "PLAN") {
      this.prePlanPermissionMode = this.workspace.permissionMode;
      await this.stores.workspaces.updateSettings(this.workspaceId, {
        permissionMode: "PLAN",
      });
      this.workspace = { ...this.workspace, permissionMode: "PLAN" };
      this.broadcast({ mode: "PLAN", type: "permission_mode" });
    }
    const planPath = this.resolvePlanFilePath();
    // Re-entering plan mode with an existing plan file replays the reminder.
    if (this.hasExitedPlanMode && PlanFile.planExists({ planFilePath: this.planFilePath })) {
      const reminder = Prompt.PlanMode.buildPlanModeReentryReminder(planPath, true);
      if (reminder.length > 0) {
        this.resolvedHandle?.conv.addSystemReminder(reminder);
      }
    }
    this.hasExitedPlanMode = false;
    return planPath;
  }

  /**
   * Mirrors the terminal UI plan approval: "yolo" auto-approves every edit,
   * "manual" restores the pre-plan mode, and "feedback" keeps planning.
   */
  async handlePlanApprovalResponse(
    choice: "yolo" | "manual" | "feedback",
    feedback?: string,
  ): Promise<void> {
    if (!this.planApprovalPending) return;
    this.planApprovalPending = false;
    if (this.planApprovalTimer !== null) {
      clearTimeout(this.planApprovalTimer);
      this.planApprovalTimer = null;
    }

    if (choice === "feedback") {
      const text = feedback?.trim() ?? "";
      if (text.length > 0) {
        await this.submit({
          input: text,
          requestId: randomUUID(),
          turnId: randomUUID(),
        });
      }
      return;
    }

    let planContent = "";
    try {
      if (this.planFilePath.length > 0 && existsSync(this.planFilePath)) {
        planContent = readFileSync(this.planFilePath, "utf-8");
      }
    } catch {
      /** noop */
    }

    this.hasExitedPlanMode = true;
    const nextMode: AgentPermissionMode =
      choice === "yolo" ? "BYPASS_PERMISSIONS" : (this.prePlanPermissionMode ?? "DEFAULT");
    await this.stores.workspaces.updateSettings(this.workspaceId, {
      permissionMode: nextMode,
    });
    this.workspace = { ...this.workspace, permissionMode: nextMode };
    this.resolvedHandle?.conv.addSystemReminder(
      Prompt.PlanMode.buildPlanModeExitReminder(this.planFilePath, planContent.length > 0),
    );
    this.broadcast({ mode: nextMode, type: "permission_mode" });
    this.broadcast({
      payload: {
        message:
          choice === "yolo"
            ? "Plan approved. Entered bypass-permissions mode."
            : "Plan approved. Each edit requires confirmation.",
        phase: "plan_approved",
      },
      type: "agent_status",
    });
    if (planContent.length > 0) {
      const execution = `Execute this plan:\n\n${planContent}`;
      if (this.isBusy) {
        this.pendingPlanExecution = execution;
      } else {
        await this.submit({ input: execution, requestId: randomUUID(), turnId: randomUUID() });
      }
    }
  }

  // ─────────────────────────── Model / thinking (Remote parity) ───────────────────────────

  /** Discovers the provider's models and opens the browser model picker. */
  async broadcastModelList(): Promise<void> {
    const handle = await this.ensureHandle();
    this.modelListController?.abort();
    const controller = new AbortController();
    this.modelListController = controller;
    const current = handle.provider.model;
    this.broadcast({ current, models: [], status: "loading", type: "model_list" });
    try {
      const models = await LLM.ModelDiscovery.discoverModels(
        {
          api_key: handle.provider.api_key,
          base_url: handle.provider.base_url,
          protocol: handle.provider.protocol,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      this.broadcast({
        current,
        models: models.map((model) => ({
          id: model.id,
          name: model.display_name ?? model.name ?? null,
        })),
        status: models.length > 0 ? "ready" : "empty",
        type: "model_list",
      });
    } catch {
      if (!controller.signal.aborted) {
        this.broadcast({ current, models: [], status: "error", type: "model_list" });
      }
    } finally {
      if (this.modelListController === controller) this.modelListController = null;
    }
  }

  /** Switches the active model, rebuilding the client (Remote /model parity). */
  async applyModel(modelId: string, requestId?: string): Promise<void> {
    const nextModel = modelId.trim();
    if (nextModel.length === 0) return;
    await this.runLockedTask(async () => {
      await this.applyModelLocked(nextModel, requestId);
    });
  }

  private async applyModelLocked(nextModel: string, requestId?: string): Promise<void> {
    const handle = await this.ensureHandle();
    if (nextModel === handle.provider.model) {
      this.sendCommandResult(requestId ?? randomUUID(), "model", true, {
        result: { model: nextModel, note: "already active" },
      });
      return;
    }
    const updated = { ...handle.provider, model: nextModel };
    try {
      const environment = Prompt.Builder.detectEnvironment(handle.cwd);
      environment.model = updated.model;
      const client = await LLM.Client.createClient(
        updated,
        Prompt.Builder.buildSystemPrompt(environment),
      );
      handle.client = client;
      handle.provider = updated;
      handle.contextWindow = Config.ProviderConfig.getContextWindow(updated);
      MCP.Strategy.decideAndApply(
        handle.registry,
        updated.base_url,
        updated.protocol,
        handle.contextWindow,
      );
    } catch (error) {
      this.broadcast({
        code: "model_switch_failed",
        message: `Failed to switch model: ${Utils.asErrorString(error)}`,
        recoverable: true,
        type: "error",
        ...(requestId !== undefined && { requestId }),
      });
      return;
    }
    await this.stores.workspaces
      .updateSettings(this.workspaceId, { modelOverride: nextModel })
      .then((workspace) => {
        this.workspace = workspace;
      })
      .catch(() => undefined);
    this.broadcast({
      payload: { message: `Model set to ${updated.model}`, phase: "model_changed" },
      type: "agent_status",
    });
    if (requestId !== undefined) {
      this.sendCommandResult(requestId, "model", true, { result: { model: nextModel } });
    }
  }

  /** Opens the thinking-level picker (Remote bare-/thinking parity). */
  async broadcastThinkingForm(): Promise<void> {
    const handle = await this.ensureHandle();
    this.broadcast({
      current:
        handle.client.getThinkingLevel?.() ??
        this.workspace.thinkingLevel ??
        Config.Constants.DEFAULT_THINKING_LEVEL,
      levels: [...(handle.client.getSupportedThinkingLevels?.() ?? [])],
      type: "thinking_form",
    });
  }

  /** Sets the thinking level on the live client and persists it. */
  async applyThinkingLevel(level: string, requestId?: string): Promise<void> {
    await this.runLockedTask(async () => {
      await this.applyThinkingLevelLocked(level, requestId);
    });
  }

  private async applyThinkingLevelLocked(level: string, requestId?: string): Promise<void> {
    const handle = await this.ensureHandle();
    const setLevel = handle.client.setThinkingLevel?.(level as Config.ProviderConfig.ThinkingLevel);
    const applied = setLevel ?? level;
    handle.provider.thinking = applied as Config.ProviderConfig.ThinkingLevel;
    await this.stores.workspaces
      .updateSettings(this.workspaceId, { thinkingLevel: applied })
      .then((workspace) => {
        this.workspace = workspace;
      })
      .catch(() => undefined);
    this.broadcast({
      payload: { message: `Thinking level set to ${applied}`, phase: "thinking_changed" },
      type: "agent_status",
    });
    if (requestId !== undefined) {
      this.sendCommandResult(requestId, "thinking", true, { result: { level: applied } });
    }
  }

  // ─────────────────────────── Sandbox (Remote parity) ───────────────────────────

  private getSandbox(): Promise<Sandbox.Sandbox | null> {
    if (this.sandbox === null) {
      this.sandbox = Sandbox.createSandbox();
    }
    return this.sandbox;
  }

  private async disposeSandbox(): Promise<void> {
    const pending = this.sandbox;
    this.sandbox = null;
    const bashTool = this.resolvedHandle?.registry.getInstanceOf("Bash", Tools.Bash.BashTool);
    if (bashTool !== undefined) {
      bashTool.sandbox = null;
      bashTool.sandboxRequired = false;
    }
    await (await pending)?.dispose?.();
  }

  /** /sandbox <auto|manual|off> — runtime sandbox toggle (Remote parity). */
  async handleSandboxCommand(args: string, requestId: string): Promise<void> {
    const handle = await this.ensureHandle();
    const arg = args.trim();
    if (arg === "off") {
      await this.disposeSandbox();
      await this.stores.workspaces
        .updateSettings(this.workspaceId, { sandboxAutoAllow: false, sandboxEnabled: false })
        .then((workspace) => {
          this.workspace = workspace;
        })
        .catch(() => undefined);
      this.sendCommandResult(requestId, "sandbox", true, { result: { sandbox: "OFF" } });
      return;
    }
    if (arg === "auto" || arg === "manual") {
      const sandbox = await this.getSandbox();
      const available = (await sandbox?.available()) ?? false;
      const bashTool = handle.registry.getInstanceOf("Bash", Tools.Bash.BashTool);
      if (bashTool !== undefined) {
        bashTool.sandbox = sandbox ?? null;
        bashTool.sandboxRequired = true;
        bashTool.sandboxConfig = {
          allowWrite: [handle.cwd],
          denyWrite: [],
          networkEnabled: true,
        };
      }
      await this.stores.workspaces
        .updateSettings(this.workspaceId, {
          sandboxAutoAllow: arg === "auto",
          sandboxEnabled: true,
        })
        .then((workspace) => {
          this.workspace = workspace;
        })
        .catch(() => undefined);
      this.sendCommandResult(requestId, "sandbox", true, {
        result: {
          available,
          sandbox: arg === "auto" ? "ON + auto-allow" : "ON + manual",
          ...(sandbox?.availabilityError !== undefined && {
            reason: sandbox.availabilityError,
          }),
        },
      });
      return;
    }
    const enabled = this.workspace.sandboxEnabled;
    this.sendCommandResult(requestId, "sandbox", true, {
      result: {
        sandbox: enabled
          ? this.workspace.sandboxAutoAllow
            ? "ON + auto-allow"
            : "ON + manual"
          : "OFF",
        usage: "/sandbox <auto|manual|off>",
      },
    });
  }

  // ─────────────────────────── MCP reload (Remote parity) ───────────────────────────

  /** /mcp reload — re-reads the workspace MCP rows and reconnects in place. */
  async reloadMcpServers(): Promise<{ connected: number; tools: number; errors: string[] }> {
    return this.runLockedTask(async () => {
      return this.reloadMcpServersLocked();
    });
  }

  private async reloadMcpServersLocked(): Promise<{
    connected: number;
    tools: number;
    errors: string[];
  }> {
    const handle = await this.ensureHandle();
    const servers = (await this.stores.mcp.listEnabled(this.workspaceId)).map(toYukinoMcpConfig);
    if (servers.length === 0) {
      const previous = handle.mcpManager;
      if (previous !== null) {
        await previous.disconnectAll();
        MCP.Instructions.retractMcpInstructions(handle.conv, this.mcpAnnounced);
      }
      Bootstrap.ToolRegistry.removeMcpTools(handle.registry);
      handle.mcpManager = null;
      return { connected: 0, errors: [], tools: 0 };
    }
    const manager = handle.mcpManager ?? new MCP.Manager.MCPManager();
    handle.mcpManager = manager;
    Bootstrap.ToolRegistry.removeMcpTools(handle.registry);
    MCP.Instructions.retractMcpInstructions(handle.conv, this.mcpAnnounced);
    const result = await manager.reconnectAll(servers);
    for (const { serverName, tool } of result.tools) {
      const client = manager.getClient(serverName);
      if (client !== undefined) {
        handle.registry.register(new MCP.ToolWrapper.MCPToolWrapper(client, serverName, tool));
      }
    }
    if (result.tools.length > 0) {
      MCP.Strategy.decideAndApply(
        handle.registry,
        handle.provider.base_url,
        handle.provider.protocol,
        handle.contextWindow,
      );
    }
    return {
      connected: manager.connectedServers().length,
      errors: result.errors.map((entry) => `${entry.serverName}: ${String(entry.error)}`),
      tools: Bootstrap.ToolRegistry.countMcpTools(handle.registry),
    };
  }

  // ─────────────────────────── Images & @-completion (Remote parity) ───────────────────────────

  /** Uploads directory lives beside the workDir so git snapshots stay clean. */
  private uploadsDir(): string {
    return join(dirname(this.workDir), `${this.appId.toString()}.uploads`);
  }

  /** Stores a browser-uploaded image so @-expansion can attach it. */
  async handleImageUpload(
    upload: { clientId: string; name: string; dataBase64: string },
    reply: ReplyFn,
  ): Promise<void> {
    try {
      const bytes = Buffer.from(upload.dataBase64, "base64");
      if (bytes.length === 0) throw new Error("Uploaded image is empty.");
      if (bytes.length > MAX_UPLOAD_IMAGE_BYTES) {
        throw new Error(
          `Uploaded image is too large (${String(bytes.length)} bytes, limit ${String(MAX_UPLOAD_IMAGE_BYTES)}).`,
        );
      }
      const mediaType = Images.sniffMediaType(bytes);
      if (mediaType === null) {
        throw new Error("Uploaded file is not a recognized image (png, jpeg, gif, webp).");
      }
      const ext =
        mediaType === "image/png"
          ? ".png"
          : mediaType === "image/jpeg"
            ? ".jpg"
            : mediaType === "image/gif"
              ? ".gif"
              : ".webp";
      const dir = this.uploadsDir();
      await mkdir(dir, { recursive: true });
      const safeName = upload.name
        .replace(/[^a-zA-Z0-9._-]/gu, "_")
        .replace(/\.[^.]*$/u, "")
        .slice(0, 80);
      const filePath = join(dir, `upload-${randomUUID()}-${safeName || "image"}${ext}`);
      await writeFile(filePath, bytes, { mode: 0o600 });
      reply({ clientId: upload.clientId, path: filePath, type: "image_saved" });
    } catch (error) {
      reply({
        clientId: upload.clientId,
        message: Utils.asErrorString(error),
        type: "image_error",
      });
    }
  }

  /** @-mention completion for the composer (Remote dropdown parity). */
  sendFileCompletions(reply: ReplyFn, requestId: string, query: string): void {
    const root = this.workDir;
    const cache = this.fileCache;
    let files: string[];
    if (cache !== null && cache.key === root && Date.now() - cache.scannedAt < FILE_CACHE_TTL_MS) {
      files = cache.files;
    } else {
      files = Utils.FileScan.scanCwdFiles(root);
      this.fileCache = { files, key: root, scannedAt: Date.now() };
    }
    reply({
      matches: Utils.FileScan.filterFileMatches(files, query),
      requestId,
      type: "file_complete_response",
    });
  }

  // ─────────────────────────── User bash (Remote parity) ───────────────────────────

  /** Runs a user "!command" through the Bash tool against the workspace. */
  private async runUserBash(
    command: string,
    excludeFromContext: boolean,
    requestId: string,
    actorUserId?: string,
  ): Promise<void> {
    await this.runLockedTask(async () => {
      const handle = await this.ensureHandle();
      const sessionId = await this.ensureSession();
      if (command.length === 0) {
        this.sendCommandResult(requestId, excludeFromContext ? "!!" : "!", false, {
          error: `Enter a Bash command after ${excludeFromContext ? "!!" : "!"}.`,
        });
        return;
      }
      const bashTool = handle.registry.getInstanceOf("Bash", Tools.Bash.BashTool);
      if (bashTool === undefined) {
        this.sendCommandResult(requestId, "!", false, { error: "Bash tool is unavailable" });
        return;
      }
      const display = `${excludeFromContext ? "!!" : "!"}${command}`;
      await this.emitPersist(null, "user_message", {
        text: display,
        userBash: true,
        ...(actorUserId !== undefined && { actorUserId }),
      });
      const controller = new AbortController();
      this.userBashController = controller;
      const toolId = `user-bash_${randomUUID()}`;
      const started = Date.now();
      await this.emitPersist(null, "tool_use", {
        args: { command },
        toolId,
        toolName: "Bash",
      });
      let result: Tools.ToolResult;
      try {
        result = await Conversation.UserBash.executeUserBash(
          bashTool,
          {
            abortSignal: controller.signal,
            cwd: handle.cwd,
            onOutput: (output) => {
              this.broadcast({
                output: Utils.plainTerminalText(output),
                toolId,
                type: "tool_output",
              });
            },
            sessionId,
          },
          command,
          excludeFromContext,
        );
      } catch (error) {
        result = { isError: true, output: `Error: ${Utils.asErrorString(error)}` };
      }
      this.userBashController = null;
      const elapsed = (Date.now() - started) / 1000;
      const status = controller.signal.aborted
        ? "stopped"
        : (result.isError ?? false)
          ? "failed"
          : "completed";
      await this.emitPersist(null, "tool_result", {
        elapsed,
        isError: result.isError ?? false,
        output: result.output,
        toolId,
        toolName: "Bash",
      });
      // Record exactly like the terminal: model context only unless "!!".
      if (!excludeFromContext) {
        const recorded: Conversation.UserBashResult = {
          command,
          elapsed,
          excludeFromContext,
          isError: result.isError ?? false,
          output: result.output,
          status,
        };
        handle.conv.addUserMessage(Conversation.Prompts.userBashContext(recorded));
      }
      this.sendCommandResult(requestId, excludeFromContext ? "!!" : "!", true, {
        result: { elapsed, isError: result.isError ?? false, status },
      });
    });
  }

  // ─────────────────────────── Review (/review subagent) ───────────────────────────

  /**
   * Runs the built-in read-only review subagent (the library replaced its
   * structured CodeReview runner with this prompt-driven /review design).
   */
  private async runReviewAgent(
    handle: Remote.Server.RemoteAgentHandle,
    turnId: string,
    prompt: string,
    displayText: string,
    abortSignal: AbortSignal,
  ): Promise<Tools.ToolResult> {
    // Per-turn checker exactly like executeTurn: the review agent's git
    // commands go through the same permission and sandbox gates.
    const checker = new Permissions.PermissionChecker(
      this.workDir,
      toYukinoMode(this.workspace.permissionMode),
    );
    checker.sandboxEnabled = this.workspace.sandboxEnabled;
    checker.sandboxAutoAllow = this.workspace.sandboxAutoAllow;
    checker.planFilePath = this.planFilePath;
    return Commands.Subagent.runSubagentCommand(
      Subagent.Constants.REVIEW_AGENT_NAME,
      prompt,
      displayText,
      {
        abortSignal,
        conversation: handle.conv,
        cwd: handle.cwd,
        onEvent: (event) => {
          // Broadcast-only bridge (the structured runner behaved the same):
          // the report itself is persisted by the caller as an assistant_message.
          if (event.type === "tool_use") {
            this.broadcast({
              payload: { args: event.args, toolId: event.toolId, toolName: event.toolName },
              type: "tool_use",
            });
          } else if (event.type === "tool_result") {
            this.broadcast({
              payload: {
                elapsed: event.elapsed,
                isError: event.isError,
                output: event.output,
                toolId: event.toolId,
                toolName: event.toolName,
              },
              type: "tool_result",
            });
          }
        },
        onPermissionRequest: this.buildPermissionCallback(checker, turnId),
        permissionChecker: checker,
        registry: handle.registry,
        sessionId: handle.sessionId,
      },
    );
  }

  /** Runs the library /review prompt command through the review subagent. */
  private async runReviewCommand(
    args: string,
    requestId: string,
    actorUserId?: string,
  ): Promise<void> {
    if (this.isBusy) {
      this.sendCommandResult(requestId, "review", false, {
        error: "A run is already in progress.",
      });
      return;
    }
    const controller = new AbortController();
    this.reviewController = controller;
    await this.runLockedTask(async () => {
      const handle = await this.ensureHandle();
      const turnId = randomUUID();
      this.currentTurnId = turnId;
      const displayText = args.trim().length > 0 ? `/review ${args.trim()}` : "/review";
      try {
        await this.emitPersist(turnId, "user_message", {
          text: displayText,
          ...(actorUserId !== undefined && { actorUserId }),
        });
        const result = await this.runReviewAgent(
          handle,
          turnId,
          buildReviewPrompt(args),
          displayText,
          controller.signal,
        );
        if (result.isError) throw new Error(result.output);
        await this.emitPersist(turnId, "assistant_message", { text: result.output });
        this.sendCommandResult(requestId, "review", true, {
          result: { message: "Review complete" },
        });
      } catch (error) {
        this.sendCommandResult(requestId, "review", false, {
          error: Utils.asErrorString(error),
        });
      } finally {
        this.reviewController = null;
        this.currentTurnId = null;
      }
    });
  }

  // ─────────────────────────── Rewind (Remote parity) ───────────────────────────

  /** Sends the rewind checkpoint list for the browser picker. */
  async broadcastRewindList(): Promise<void> {
    const snapshots = await this.git.listSnapshots(this.workDir);
    if (snapshots.length === 0) {
      this.broadcast({ snapshots: [], type: "rewind_list" });
      return;
    }
    const points = await this.loadRewindPoints();
    const withConversation = new Set(points.map((point) => point.sha));
    this.broadcast({
      snapshots: snapshots.map((snapshot) => ({
        conversation: withConversation.has(snapshot.sha),
        date: snapshot.date,
        message: snapshot.message,
        sha: snapshot.sha,
      })),
      type: "rewind_list",
    });
  }

  /** Restores code and/or conversation to a checkpoint (Remote /rewind parity). */
  async handleRewindAction(
    sha: string,
    action: "code_and_conversation" | "conversation_only" | "code_only",
    requestId: string,
  ): Promise<void> {
    if (this.isBusy) {
      this.sendCommandResult(requestId, "rewind", false, {
        error: "Cannot rewind while a run is in progress.",
      });
      return;
    }
    await this.runLockedTask(async () => {
      const handle = await this.ensureHandle();
      if (action !== "conversation_only") {
        const ok = await this.git.rewindTo(this.workDir, sha);
        if (!ok) {
          this.sendCommandResult(requestId, "rewind", false, { error: "Rewind failed" });
          return;
        }
        this.broadcast({ paths: [], revision: sha, type: "files_changed" });
      }
      if (action !== "code_only") {
        const points = await this.loadRewindPoints();
        const point = points.find((entry) => entry.sha === sha);
        if (point === undefined) {
          this.sendCommandResult(requestId, "rewind", false, {
            error: "No conversation checkpoint exists for this snapshot.",
          });
          return;
        }
        handle.conv.truncateTo(point.messageCount);
        await this.stores.transcript.truncateAfter(this.sessionId, point.sequence);
        await this.stores.sessions.setSequence(this.sessionId, point.sequence);
        this.sequence = point.sequence;
        // Keep every checkpoint at or before the rewind target; later ones point
        // at conversation state that no longer exists. Persisting only
        // `{ rewoundTo }` here would wipe the whole checkpoint list, so merge
        // the surviving points back in (regression fix).
        const surviving = points.filter((entry) => entry.sequence <= point.sequence);
        try {
          await this.stores.sessions.saveContext(this.sessionId, {
            activeSkills: [...handle.activeSkills.keys()],
            context: { messages: handle.conv.getMessages() },
            runtimeMetadata: { rewoundTo: sha, rewindPoints: serializeRewindPoints(surviving) },
          });
        } catch {}
        // Connected watchers must drop the truncated tail and re-sync.
        this.broadcast({
          highWatermark: point.sequence.toString(),
          sessionId: this.sessionId,
          type: "session_replaced",
        });
      }
      this.sendCommandResult(requestId, "rewind", true, {
        result: { action, rewoundTo: sha },
      });
    });
  }

  // ─────────────────────────── Skill fork (Remote parity) ───────────────────────────

  /** Runs a fork-mode skill in an isolated subagent (Remote handleSkillFork parity). */
  private async runSkillFork(
    handle: Remote.Server.RemoteAgentHandle,
    skill: Skills.Skill,
    args: string,
    requestId: string,
  ): Promise<void> {
    await this.runLockedTask(async () => {
      await this.runSkillForkLocked(handle, skill, args, requestId);
    });
  }

  private async runSkillForkLocked(
    handle: Remote.Server.RemoteAgentHandle,
    skill: Skills.Skill,
    args: string,
    requestId: string,
  ): Promise<void> {
    const controller = new AbortController();
    this.forkController = controller;
    this.broadcast({
      payload: { message: `Running skill "${skill.meta.name}" in fork mode…`, phase: "skill_fork" },
      type: "agent_status",
    });
    try {
      const forkHost: Skills.SkillForkHost = {
        activateSkill: (name, body) => {
          handle.activeSkills.set(name, body);
        },
        runSubagent: (prompt, abortSignal, context) =>
          Subagent.Spawn.spawnSubagent(
            {
              description: skill.meta.description,
              name: skill.meta.name,
              ...(skill.meta.model !== undefined && { model: skill.meta.model }),
            },
            prompt,
            handle.client,
            handle.registry,
            handle.provider,
            handle.cwd,
            undefined,
            (event) => {
              this.forwardSubagentSink(`fork-skill-${skill.meta.name}`, event);
            },
            undefined,
            context?.permissionChecker?.forCwd(handle.cwd) ?? handle.checker.forCwd(handle.cwd),
            {
              abortSignal: abortSignal ?? controller.signal,
              background: false,
              onPermissionRequest: context?.onPermissionRequest,
            },
          ),
        snapshotParentMessages: (count: number) => {
          const messages = handle.conv.getMessages();
          return messages
            .slice(-count)
            .map((message) => `[${message.role}] ${Utils.contentToText(message.content)}`)
            .join("\n");
        },
      };
      const result = await Skills.Executor.runFork(skill, args, forkHost, controller.signal);
      await this.emitPersist(this.currentTurnId, "assistant_message", { text: result });
      this.sendCommandResult(requestId, "skill", true, {
        result: { forked: skill.meta.name },
      });
    } catch (error) {
      this.sendCommandResult(requestId, "skill", false, {
        error: `Skill fork error: ${Utils.asErrorString(error)}`,
      });
    } finally {
      this.forkController = null;
    }
  }

  /** Maps a subagent progress event onto the activity broadcast state. */
  private forwardSubagentSink(
    toolCallId: string,
    event: Subagent.Spawn.SubagentProgressEvent,
  ): void {
    switch (event.type) {
      case "tool_use":
        this.handleSubagentEvent({
          background: false,
          role: "fork",
          toolCallId,
          toolId: event.toolId,
          toolName: event.toolName,
          type: "tool_use",
        });
        break;
      case "tool_result":
        this.handleSubagentEvent({
          background: false,
          role: "fork",
          toolCallId,
          toolId: event.toolId,
          type: "tool_result",
        });
        break;
      case "turn_complete":
        this.handleSubagentEvent({
          background: false,
          role: "fork",
          toolCallId,
          type: "turn_complete",
        });
        break;
      default:
        break;
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise;
    this.disposing = true;
    this.disposePromise = this.disposeResources();
    return this.disposePromise;
  }

  private async disposeResources(): Promise<void> {
    this.runCanceled = true;
    this.followUps = [];
    if (this.wakeupTimer !== null) {
      clearInterval(this.wakeupTimer);
      this.wakeupTimer = null;
    }
    if (this.teammateTimer !== null) {
      clearInterval(this.teammateTimer);
      this.teammateTimer = null;
    }
    if (this.unsubscribeTasks !== null) {
      this.unsubscribeTasks();
      this.unsubscribeTasks = null;
    }
    this.currentAbort?.abort();
    const sessionAtAbort = this.sessionId;
    if (sessionAtAbort.length > 0) {
      await this.broker.cancelSession(sessionAtAbort).catch(() => undefined);
    }

    await this.lock.drain();

    await this.sessionPromise?.catch(() => undefined);
    if (this.sessionId.length > 0) {
      await this.broker.cancelSession(this.sessionId).catch(() => undefined);
    }

    if (this.planApprovalTimer !== null) {
      clearTimeout(this.planApprovalTimer);
      this.planApprovalTimer = null;
    }
    this.modelListController?.abort();
    this.reviewController?.abort();
    this.forkController?.abort();
    this.userBashController?.abort();
    if (this.handlePromise !== undefined) {
      const handle = await this.handlePromise.catch(() => undefined);
      if (handle !== undefined) {
        await handle.backgroundTaskManager.stopAll().catch(() => undefined);
        await handle.teamManager.stopAll().catch(() => undefined);
        await handle.mcpManager?.disconnectAll().catch(() => undefined);
        await handle.hookEngine?.fire("shutdown", { event: "shutdown" }).catch(() => undefined);
        // RemoteServer.stop parity: dispose the registry so LSP servers and
        // other tool-owned child processes do not outlive the workspace.
        await handle.registry.dispose().catch(() => undefined);
      }
    }
    // Remote stopMemoryTasks parity: settle in-flight memory LLM calls so they
    // cannot outlive the workspace or write reminders after shutdown.
    const memoryTasks = this.memoryTasks;
    this.memoryTasks = null;
    await memoryTasks?.dispose().catch(() => undefined);
    await this.disposeSandbox().catch(() => undefined);
    this.resolvedHandle = null;
    this.subagentStates.clear();
    for (const connection of this.connections) {
      try {
        connection.close(1001, "runtime disposed");
      } catch {}
    }
    this.connections.clear();
  }

  async resolvePermission(interactionId: string, decision: PermissionDecision): Promise<boolean> {
    this.markActivity();
    const pending = this.broker
      .snapshot(this.sessionId)
      .find((interaction) => interaction.interactionId === interactionId);
    const resolved = await this.broker.resolvePermission(interactionId, decision);
    if (resolved && pending !== undefined) {
      this.broadcast({
        interactionId,
        outcome: decision === "deny" ? "denied" : "allowed",
        sessionId: pending.sessionId,
        type: "interaction_resolved",
      });
    }
    return resolved;
  }

  async resolveQuestion(interactionId: string, answers: QuestionAnswers): Promise<boolean> {
    this.markActivity();
    const pending = this.broker
      .snapshot(this.sessionId)
      .find((interaction) => interaction.interactionId === interactionId);
    const resolved = await this.broker.resolveQuestion(interactionId, answers);
    if (resolved && pending !== undefined) {
      this.broadcast({
        interactionId,
        outcome: "answered",
        sessionId: pending.sessionId,
        type: "interaction_resolved",
      });
    }
    return resolved;
  }

  getCommandCandidates(): CommandCandidate[] {
    return buildCommandCandidates();
  }

  private async startNewSession(): Promise<string> {
    const session = await this.stores.sessions.createAndSetCurrent(this.workspaceId);
    this.workspace = { ...this.workspace, currentSessionId: session.id };
    this.sessionId = session.id;
    this.sequence = session.lastEventSequence;
    this.sessionPromise = Promise.resolve(session.id);
    return session.id;
  }

  private sendCommandResult(
    requestId: string,
    command: string,
    supported: boolean,
    detail: { result?: unknown; error?: string },
  ): void {
    this.broadcast({
      command,
      requestId,
      supported,
      type: "command_result",
      ...(detail.result !== undefined && { result: detail.result }),
      ...(detail.error !== undefined && { error: detail.error }),
    });
  }

  async handleCommand(input: string, requestId: string, actorUserId?: string): Promise<void> {
    const parsed = parseCommand(input);
    if (parsed === null) {
      this.sendCommandResult(requestId, input, false, {
        error: "Not a command",
      });
      return;
    }
    const { args, name } = parsed;
    if (!SERVER_SUPPORTED_COMMANDS.has(name)) {
      this.sendCommandResult(requestId, name, false, {
        error: `Command /${name} is not supported by the server runtime`,
      });
      return;
    }

    if (name === "help") {
      this.sendCommandResult(requestId, name, true, {
        result: this.getCommandCandidates(),
      });
      return;
    }

    const handle = await this.ensureHandle();

    if (name === "skill") {
      await this.runSkillCommand(handle, args, requestId);
      return;
    }
    if (name === "skills") {
      if (args.trim() === "reload") handle.skillCatalog?.reload();
      this.sendCommandResult(requestId, name, true, {
        result: handle.skillCatalog?.list() ?? [],
      });
      return;
    }
    if (name === "memory") {
      this.sendCommandResult(requestId, name, true, {
        result: handle.memoryManager.loadAll().map((file) => ({
          description: file.description,
          name: file.name,
          type: file.type,
        })),
      });
      return;
    }
    if (name === "mcp") {
      if (args.trim().toLowerCase() === "reload") {
        const summary = await this.reloadMcpServers();
        this.sendCommandResult(requestId, name, true, { result: summary });
        return;
      }
      this.sendCommandResult(requestId, name, true, {
        result: {
          connected: handle.mcpManager?.connectedServers() ?? [],
          tools: Bootstrap.ToolRegistry.countMcpTools(handle.registry),
        },
      });
      return;
    }
    if (name === "status") {
      this.sendCommandResult(requestId, name, true, {
        result: {
          contextTokens: Compact.Compact.currentContextTokens(handle.conv),
          contextWindow: handle.contextWindow,
          cwd: handle.cwd,
          mcpServers: handle.mcpManager?.connectedServers().length ?? 0,
          mcpTools: Bootstrap.ToolRegistry.countMcpTools(handle.registry),
          memories: this.workspace.memoryEnabled
            ? handle.memoryManager.loadAll().length
            : "disabled",
          model: handle.provider.model,
          permissionMode: this.workspace.permissionMode,
          sandbox: this.workspace.sandboxEnabled
            ? this.workspace.sandboxAutoAllow
              ? "ON + auto-allow"
              : "ON + manual"
            : "OFF",
          sessionId: this.sessionId,
          skills: handle.skillCatalog?.list().length ?? 0,
          thinkingLevel: handle.client.getThinkingLevel?.() ?? this.workspace.thinkingLevel ?? null,
          tokens: this.lastUsage,
          toolCount: handle.registry.listTools().length,
        },
      });
      return;
    }
    if (name === "goal") {
      if (handle.goalManager === undefined) {
        this.sendCommandResult(requestId, name, false, { error: "Goal tracking is unavailable" });
        return;
      }
      const result = Goal.handleGoalCommand(handle.goalManager, args);
      this.sendCommandResult(requestId, name, result.isError !== true, {
        ...(result.isError === true
          ? { error: result.message }
          : { result: { message: result.message } }),
      });
      if (result.prompt !== undefined) {
        await this.runTurn({
          input: result.prompt,
          requestId: randomUUID(),
          turnId: randomUUID(),
          ...(actorUserId !== undefined && { actorUserId }),
        });
      }
      return;
    }
    if (name === "plan") {
      const planPath = await this.enterPlanMode();
      this.sendCommandResult(requestId, name, true, {
        result: {
          message: `Entered plan mode (read-only). Plan file: ${planPath}`,
          planPath,
        },
      });
      if (args.trim().length > 0) {
        await this.runTurn({
          input: args.trim(),
          requestId: randomUUID(),
          turnId: randomUUID(),
          ...(actorUserId !== undefined && { actorUserId }),
        });
      }
      return;
    }
    if (name === "model") {
      if (args.trim().length > 0) {
        await this.applyModel(args.trim(), requestId);
      } else {
        await this.broadcastModelList();
        this.sendCommandResult(requestId, name, true, {
          result: { hint: "model picker broadcast" },
        });
      }
      return;
    }
    if (name === "thinking") {
      if (args.trim().length > 0) {
        await this.applyThinkingLevel(args.trim(), requestId);
      } else {
        await this.broadcastThinkingForm();
        this.sendCommandResult(requestId, name, true, {
          result: { hint: "thinking picker broadcast" },
        });
      }
      return;
    }
    if (name === "sandbox") {
      await this.handleSandboxCommand(args, requestId);
      return;
    }
    if (name === "worktree") {
      const worktrees = await this.git.listWorktrees(handle.cwd);
      this.sendCommandResult(requestId, name, true, { result: { worktrees } });
      return;
    }
    if (name === "review") {
      await this.runReviewCommand(args, requestId, actorUserId);
      return;
    }
    if (name === "clear") {
      await this.runLockedTask(async () => {
        handle.conv.reset();
        // Remote clearConversation parity: stop the memory tasks so the next
        // run starts a fresh cursor over the cleared conversation.
        const memoryTasks = this.memoryTasks;
        this.memoryTasks = null;
        await memoryTasks?.dispose().catch(() => undefined);
        await this.startNewSession();
        // Remote clearConversation parity: plan state rotates with the session.
        this.planFilePath = "";
        this.hasExitedPlanMode = false;
        this.exitPlanSucceeded = false;
        this.planApprovalPending = false;
        this.pendingPlanExecution = null;
        if (this.planApprovalTimer !== null) {
          clearTimeout(this.planApprovalTimer);
          this.planApprovalTimer = null;
        }
      });
      this.sendCommandResult(requestId, name, true, {
        result: { sessionId: this.sessionId },
      });
      for (const connection of this.connections) {
        await this.ready(connection);
      }
      this.broadcast({
        sessionId: this.sessionId,
        status: "idle",
        type: "runtime_status",
      });
      return;
    }
    if (name === "compact") {
      await this.runLockedTask(async () => {
        // Run-equivalent tool visibility (Remote parity): the compaction
        // prompt must describe exactly the tools the next loop will see.
        const protocol = handle.client.protocol ?? "anthropic";
        const filter = this.composeToolFilter(handle);
        const result = await Compact.Compact.forceCompact(
          handle.conv,
          handle.client,
          handle.recoveryState,
          handle.registry.listVisibleToolNames(protocol, filter),
          handle.registry.getAllSchemas(protocol, filter),
        );
        this.sendCommandResult(requestId, name, true, {
          result: { compacted: result.compacted, message: result.message },
        });
      });
      return;
    }
    if (name === "rewind") {
      await this.runRewindCommand(args, requestId);
      return;
    }
  }

  private async runSkillCommand(
    handle: Remote.Server.RemoteAgentHandle,
    args: string,
    requestId: string,
  ): Promise<void> {
    const trimmed = args.trim();
    if (trimmed === "reload") {
      handle.skillCatalog?.reload();
      this.sendCommandResult(requestId, "skill", true, {
        result: handle.skillCatalog?.list() ?? [],
      });
      return;
    }
    const [skillName = "", ...rest] = trimmed.split(/\s+/u);
    const skill = handle.skillCatalog?.get(skillName);
    if (skill === undefined) {
      this.sendCommandResult(requestId, "skill", false, {
        error: `Unknown skill: ${skillName}`,
      });
      return;
    }
    // Fork-mode skills run in an isolated subagent (Remote parity); inline
    // skills expand into a prompt for the main conversation.
    if (skill.meta.mode === "fork") {
      await this.runSkillFork(handle, skill, rest.join(" "), requestId);
      return;
    }
    const prompt = Skills.Executor.runInline(skill, rest.join(" "), {
      activateSkill: (activatedName, body) => handle.activeSkills.set(activatedName, body),
    });
    this.sendCommandResult(requestId, "skill", true, {
      result: { activated: skillName },
    });
    await this.runTurn({ input: prompt, requestId, turnId: randomUUID() });
  }

  private async runRewindCommand(args: string, requestId: string): Promise<void> {
    const sha = args.trim();
    if (sha.length === 0) {
      // Remote parity: the structured snapshot list drives the browser picker;
      // the rewind_action message carries the chosen checkpoint back.
      await this.broadcastRewindList();
      this.sendCommandResult(requestId, "rewind", true, {
        result: { hint: "rewind picker broadcast" },
      });
      return;
    }
    await this.handleRewindAction(sha, "code_only", requestId);
  }
}

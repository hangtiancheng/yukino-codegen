import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  Agent,
  Compact,
  Config,
  type Conversation,
  MCP,
  Memory,
  Permissions,
  Remote,
  Skills,
  Subagent,
  Teams,
  type Tools,
  Utils,
} from "@yukino.js/yukino";
import { env } from "../config/index.js";
import type {
  AgentPermissionMode,
  AgentSessionStatus,
} from "../generated/prisma/enums.js";
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
import type {
  AgentServerMessage,
  AgentTranscriptEventMessage,
} from "./protocol.js";
import { buildProviderConfig } from "./provider.js";
import type { AgentStores } from "./stores.js";
import type {
  AgentConnection,
  PermissionDecision,
  QuestionAnswers,
} from "./types.js";
import { AsyncLock } from "./workspace-lock.js";

const REPLAY_LIMIT = 200;
const BACKLOG_BATCH_SIZE = 1_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMessageContent = (
  value: unknown,
): value is Conversation.Message["content"] =>
  typeof value === "string" ||
  (Array.isArray(value) && value.every((item) => isRecord(item)));

const isThinkingBlock = (value: unknown): value is Conversation.ThinkingBlock =>
  isRecord(value) &&
  typeof value.thinking === "string" &&
  typeof value.signature === "string";

const isToolUseBlock = (value: unknown): value is Conversation.ToolUseBlock =>
  isRecord(value) &&
  typeof value.toolUseId === "string" &&
  typeof value.toolName === "string" &&
  isRecord(value.arguments);

const isToolResultBlock = (
  value: unknown,
): value is Conversation.ToolResultBlock =>
  isRecord(value) &&
  typeof value.toolUseId === "string" &&
  isMessageContent(value.content) &&
  typeof value.isError === "boolean";

const isMessage = (value: unknown): value is Conversation.Message => {
  if (
    !isRecord(value) ||
    (value.role !== "user" &&
      value.role !== "assistant" &&
      value.role !== "system") ||
    !isMessageContent(value.content) ||
    (value.role !== "user" && typeof value.content !== "string")
  ) {
    return false;
  }
  if (
    value.thinkingBlocks !== undefined &&
    (!Array.isArray(value.thinkingBlocks) ||
      !value.thinkingBlocks.every(isThinkingBlock))
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
    (Array.isArray(value.toolResults) &&
      value.toolResults.every(isToolResultBlock))
  );
};

export const parseSavedConversationMessages = (
  context: unknown,
): Conversation.Message[] | null => {
  if (!isRecord(context) || !Array.isArray(context.messages)) return null;
  return context.messages.every(isMessage) ? context.messages : null;
};

const parseSavedActiveSkills = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((name): name is string => typeof name === "string")
    : [];

/**
 * True for user messages whose content is a `<system-reminder>` wrapper (the
 * long-term-memory injection, MCP instruction announcements, task/hook
 * notifications). These are re-derivable at runtime — the memory injection is
 * re-created on every handle build and MCP instructions are re-announced via
 * syncMcpInstructions — so persisted copies are dropped on rehydrate instead of
 * accumulating one layer per restart.
 */
const isWrappedSystemReminder = (message: Conversation.Message): boolean =>
  message.role === "user" &&
  typeof message.content === "string" &&
  message.content.startsWith("<system-reminder>") &&
  message.content.endsWith("</system-reminder>");

const toYukinoMode = (
  mode: AgentPermissionMode,
): Permissions.PermissionMode => {
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

export type RunTurnInput = Readonly<{
  requestId: string;
  turnId: string;
  input: string;
  selectedElement?: Record<string, unknown>;
  previewError?: string;
}>;

export type AgentRuntimeDeps = Readonly<{
  workspace: AgentWorkspaceModel;
  appId: bigint;
  workDir: string;
  stores: AgentStores;
  git: GitRuntime;
  metrics: MetricsService;
}>;

const toEventMessage = (
  row: AgentTranscriptEventModel,
): AgentTranscriptEventMessage => ({
  createdAt: row.createTime.toISOString(),
  kind: row.kind,
  payload: row.payload,
  sequence: row.sequence.toString(),
  sessionId: row.sessionId,
  ...(row.turnId !== null && { turnId: row.turnId }),
});

/**
 * A long-lived, per-app agent runtime. One instance owns the Yukino agent stack
 * (via createRemoteAgent), the canonical DB session, the transcript sequence
 * counter, and the set of connected subscribers. Turns are serialized through an
 * internal lock and each turn constructs a fresh Agent with a permission checker
 * reflecting the workspace's current mode (default: bypassPermissions).
 */
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
  // MCP servers whose instructions this conversation has already been told
  // about; syncMcpInstructions replays the announcement once the reminder
  // leaves history (compaction, session restore).
  private readonly mcpAnnounced = new Set<string>();

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

  constructor(deps: AgentRuntimeDeps) {
    this.appId = deps.appId;
    this.workspaceId = deps.workspace.id;
    this.workspace = deps.workspace;
    this.workDir = deps.workDir;
    this.stores = deps.stores;
    this.git = deps.git;
    this.metrics = deps.metrics;
    this.broker = createInteractionBroker(deps.stores);
  }

  get lastActivity(): number {
    return this.lastActivityMs;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get isBusy(): boolean {
    return (
      this.activeTaskCount > 0 ||
      this.currentTurnId !== null ||
      this.broker.hasPending()
    );
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
      } catch {
        /* a broken socket is dropped on its own close handler */
      }
    }
  }

  private ensureSession(): Promise<string> {
    this.assertAcceptingTasks();
    if (this.sessionId.length > 0) return Promise.resolve(this.sessionId);
    if (this.sessionPromise !== undefined) return this.sessionPromise;
    const sessionPromise = this.initializeSession();
    this.sessionPromise = sessionPromise;
    void sessionPromise.catch(() => {
      if (this.sessionPromise === sessionPromise)
        this.sessionPromise = undefined;
    });
    return sessionPromise;
  }

  private async initializeSession(): Promise<string> {
    const currentId = this.workspace.currentSessionId;
    if (currentId !== null) {
      const existing = await this.stores.sessions.findById(currentId);
      if (existing !== null) {
        // A fresh process has no Promise waiting for persisted PENDING rows. Only
        // cancel those stale rows here; live broker entries are never consulted.
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
    const session = await this.stores.sessions.createAndSetCurrent(
      this.workspaceId,
    );
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
    const provider = buildProviderConfig(env, this.workspace.modelOverride);
    const handle = await Remote.Server.createRemoteAgent({
      askUser: this.askUser,
      enableCoordinatorMode: false,
      forkDisabled: false,
      hooks: buildHookConfigs(hookRows),
      mcpServers: mcpRows.map(toYukinoMcpConfig),
      provider,
      workDir: this.workDir,
    });
    await this.rehydrate(handle);
    return handle;
  }

  private async rehydrate(
    handle: Remote.Server.RemoteAgentHandle,
  ): Promise<void> {
    const sessionId = await this.ensureSession();
    const session = await this.stores.sessions.findById(sessionId);
    const savedMessages = parseSavedConversationMessages(session?.context);

    // createRemoteAgent unconditionally injects project instructions plus the
    // full long-term memory into the conversation. Drop that injection so
    // Agent.restoreContext() becomes the single injection point: on the first
    // turn it re-injects instructions, the skill listing, and — honoring the
    // workspace's memoryEnabled gate — the memory. Without this reset a fresh
    // (or transcript-replayed) session would carry the memory even when
    // memoryEnabled is false, because injectLongTermMemory is a no-op once the
    // library has injected once.
    handle.conv.reset();

    if (savedMessages !== null && savedMessages.length > 0) {
      // Canonical restore (mirrors the library's restoreRemoteSession): append
      // the persisted messages verbatim, preserving thinking/tool-use/tool-result
      // blocks (including contentBlocks) exactly. Persisted <system-reminder>
      // wrappers are dropped: they are re-derivable at runtime and would
      // otherwise accumulate one copy per restart.
      handle.conv.appendMessages(
        savedMessages.filter((message) => !isWrappedSystemReminder(message)),
      );
    } else {
      const rows = await this.stores.transcript.listRecent(
        sessionId,
        REPLAY_LIMIT,
      );
      for (const row of rows) {
        const payload = row.payload as { text?: unknown } | null;
        const text =
          payload !== null && typeof payload.text === "string"
            ? payload.text
            : "";
        if (text.length === 0) continue;
        if (row.kind === "user_message") handle.conv.addUserMessage(text);
        else if (row.kind === "assistant_message")
          handle.conv.addAssistantMessage(text);
      }
    }

    if (handle.skillCatalog !== null) {
      for (const name of parseSavedActiveSkills(session?.activeSkills)) {
        const skill = handle.skillCatalog.get(name);
        if (skill !== undefined) handle.activeSkills.set(name, skill.body);
      }
    }
  }

  private readonly askUser: Tools.AskUser.Asker = async (
    questions: Tools.AskUser.Question[],
  ) => {
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

  private buildPermissionCallback(
    checker: Permissions.PermissionChecker,
    turnId: string,
  ) {
    return async (
      toolName: string,
      args: Record<string, unknown>,
      decision: Permissions.Decision,
    ): Promise<PermissionDecision> => {
      if (this.disposing) return "deny";
      const description = checker.describeToolAction(toolName, args);
      const { decision: pending, interactionId } =
        await this.broker.requestPermission({
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
      try {
        return await pending;
      } finally {
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

  private async setStatus(
    status: AgentSessionStatus,
    completed = false,
  ): Promise<void> {
    await this.stores.sessions.updateStatus(this.sessionId, status, completed);
  }

  addConnection(connection: AgentConnection): void {
    this.markActivity();
    this.connections.add(connection);
  }

  removeConnection(connection: AgentConnection): void {
    this.connections.delete(connection);
  }

  touch(): void {
    this.markActivity();
  }

  /** Runs a task under the same lock as agent turns (used by file mutations). */
  async runExclusive<T>(task: (workDir: string) => Promise<T>): Promise<T> {
    this.markActivity();
    return this.runLockedTask(() => task(this.workDir));
  }

  notifyFilesChanged(paths: readonly string[]): void {
    this.broadcast({ paths: [...paths], type: "files_changed" });
  }

  private async currentHighWatermark(sessionId: string): Promise<bigint> {
    const persisted = await this.stores.sessions.findById(sessionId);
    const highWatermark =
      persisted !== null &&
      persisted !== undefined &&
      persisted.lastEventSequence > this.sequence
        ? persisted.lastEventSequence
        : this.sequence;
    this.sequence = highWatermark;
    return highWatermark;
  }

  async ready(connection: AgentConnection): Promise<void> {
    const sessionId = await this.ensureSession();
    const highWatermark = await this.currentHighWatermark(sessionId);
    const pendingInteractions = this.broker.snapshot(sessionId);
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
    });
  }

  async sendBacklog(
    connection: AgentConnection,
    afterSequence: bigint,
  ): Promise<void> {
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
    memoryEnabled?: boolean;
  }): void {
    this.workspace = {
      ...this.workspace,
      ...(patch.permissionMode !== undefined && {
        permissionMode: patch.permissionMode,
      }),
      ...(patch.sandboxEnabled !== undefined && {
        sandboxEnabled: patch.sandboxEnabled,
      }),
      ...(patch.memoryEnabled !== undefined && {
        memoryEnabled: patch.memoryEnabled,
      }),
    };
    this.broadcast({
      sessionId: this.sessionId,
      status: "idle",
      type: "runtime_status",
      detail: `permissionMode=${this.workspace.permissionMode}`,
    });
  }

  abort(): void {
    this.currentAbort?.abort();
    // Mirrors the library's RemoteAgentHandle.abort(): interrupting the turn
    // also stops backgrounded tasks and teammates, or their processes would
    // outlive the interruption.
    void this.handlePromise
      ?.then((handle) =>
        Promise.allSettled([
          handle.backgroundTaskManager.stopAll(),
          handle.teamManager.stopAll(),
        ]),
      )
      .catch(() => undefined);
  }

  async runTurn(input: RunTurnInput): Promise<void> {
    await this.runLockedTask(async () => {
      this.markActivity();
      const handle = await this.ensureHandle();
      const sessionId = await this.ensureSession();
      this.currentTurnId = input.turnId;
      const abort = new AbortController();
      this.currentAbort = abort;

      try {
        await this.emitPersist(input.turnId, "user_message", {
          text: input.input,
          ...(input.selectedElement !== undefined && {
            selectedElement: input.selectedElement,
          }),
          ...(input.previewError !== undefined && {
            previewError: input.previewError,
          }),
        });
        await this.setStatus("RUNNING");
        this.broadcast({
          sessionId,
          status: "running",
          turnId: input.turnId,
          type: "runtime_status",
        });

        const adapter = createEventAdapter();
        const checker = new Permissions.PermissionChecker(
          this.workDir,
          toYukinoMode(this.workspace.permissionMode),
        );
        checker.sandboxEnabled = this.workspace.sandboxEnabled;

        handle.conv.addUserMessage(this.composePrompt(input));

        // Announce the instructions of every connected MCP server this
        // conversation has not seen yet; the announcement is replayed once
        // compaction or restore removes it from history.
        if (handle.mcpManager !== null) {
          MCP.Instructions.syncMcpInstructions(
            handle.conv,
            this.mcpAnnounced,
            handle.mcpManager,
          );
        }

        const skillSection =
          handle.skillCatalog !== null
            ? Skills.Catalog.buildSkillSection(
                handle.skillCatalog,
                this.workDir,
              )
            : "";

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
          instructions: handle.longTermMemoryInstructions,
          maxIterations: env.AI_MAX_ITERATIONS,
          maxOutput: Config.getMaxOutputTokens(handle.provider),
          memoryContent: this.workspace.memoryEnabled
            ? handle.longTermMemoryMemoryContent
            : "",
          notificationFn: () => [
            ...handle.teamManager.drainLeads(),
            ...handle.backgroundTaskManager
              .drainNotifications()
              .map(Subagent.TaskManager.formatAgentTaskNotification),
          ],
          onPermissionRequest: this.buildPermissionCallback(
            checker,
            input.turnId,
          ),
          recoveryState: handle.recoveryState,
          registry: handle.registry,
          // Session persistence is DB-only: passing an empty sessionId disables
          // Yukino's own JSONL session writes so the DB transcript is authoritative.
          sessionId: "",
          skillSection,
          // The long-term-memory injection (which carries the skill listing)
          // happens once per conversation, so skills installed mid-session are
          // announced through this delta reminder instead.
          skillDeltaFn: () => {
            const section =
              handle.skillCatalog !== null
                ? Skills.Catalog.buildSkillSection(
                    handle.skillCatalog,
                    this.workDir,
                  )
                : "";
            return section.length > 0 &&
              !handle.conv.hasReminderContaining(section)
              ? section
              : "";
          },
          workDir: this.workDir,
          toolFilter: (name: string) =>
            Teams.Coordinator.coordinatorToolFilter(false)(name) &&
            (handle.toolFilter !== null ? handle.toolFilter(name) : true),
          ...(this.workspace.hooksEnabled &&
            handle.hookEngine !== null && { hookEngine: handle.hookEngine }),
          ...(this.workspace.memoryEnabled && {
            onLoopComplete: (conv) => this.runMemoryMaintenance(handle, conv),
          }),
        });

        try {
          for await (const event of agent.run()) {
            await this.dispatchEvent(input.turnId, adapter, event);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Agent run failed";
          await this.emitPersist(input.turnId, "error", { message });
          this.broadcast({
            code: "agent_error",
            message,
            recoverable: true,
            requestId: input.requestId,
            type: "error",
          });
        }

        await this.finalizeTurn(handle, input, adapter);
      } finally {
        this.currentAbort = undefined;
        this.currentTurnId = null;
      }
    });
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
    const summary = conv
      .getMessages()
      .slice(-40)
      .map(
        (message) =>
          `[${message.role}]: ${Utils.contentToText(message.content)}`,
      )
      .filter((line) => line.length > 12)
      .join("\n");
    new Memory.Extractor.MemoryExtractor(handle.client, this.workDir)
      .extract(summary)
      .catch(() => {
        /* non-fatal */
      });
    new Memory.Consolidation.MemoryConsolidator(handle.client, this.workDir, {
      appendSystem: (message) => conv.addSystemReminder(message),
    })
      .maybeRun()
      .catch(() => {
        /* non-fatal */
      });
  }

  private async finalizeTurn(
    handle: Remote.Server.RemoteAgentHandle,
    input: RunTurnInput,
    adapter: ReturnType<typeof createEventAdapter>,
  ): Promise<void> {
    const narration = adapter.narration();
    if (narration.length > 0) {
      await this.emitPersist(input.turnId, "assistant_message", {
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
    if (outcome === "end_turn") {
      const sha = await this.git.snapshot(
        this.workDir,
        `agent: ${input.turnId}`,
      );
      this.broadcast({
        paths: [],
        type: "files_changed",
        ...(sha !== undefined && { revision: sha }),
      });
    }

    try {
      await this.stores.sessions.saveContext(this.sessionId, {
        activeSkills: [...handle.activeSkills.keys()],
        context: { messages: handle.conv.getMessages() },
        runtimeMetadata: { lastOutcome: outcome, lastTurnId: input.turnId },
      });
    } catch {
      /* snapshot persistence is best-effort */
    }

    await this.setStatus("IDLE");
    this.broadcast({
      sessionId: this.sessionId,
      status: "idle",
      type: "runtime_status",
    });
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise;
    this.disposing = true;
    this.disposePromise = this.disposeResources();
    return this.disposePromise;
  }

  private async disposeResources(): Promise<void> {
    this.currentAbort?.abort();
    const sessionAtAbort = this.sessionId;
    if (sessionAtAbort.length > 0) {
      await this.broker.cancelSession(sessionAtAbort).catch(() => undefined);
    }

    // Disposal is never called from inside the workspace lock: doing so would
    // wait on the task that invoked it. Admission is already closed above.
    await this.lock.drain();

    await this.sessionPromise?.catch(() => undefined);
    if (this.sessionId.length > 0) {
      await this.broker.cancelSession(this.sessionId).catch(() => undefined);
    }

    if (this.handlePromise !== undefined) {
      const handle = await this.handlePromise.catch(() => undefined);
      if (handle !== undefined) {
        await handle.backgroundTaskManager.stopAll().catch(() => undefined);
        await handle.teamManager.stopAll().catch(() => undefined);
        await handle.mcpManager?.disconnectAll().catch(() => undefined);
        await handle.hookEngine
          ?.fire("shutdown", { event: "shutdown" })
          .catch(() => undefined);
        try {
          handle.fileHistory.save();
        } catch {
          /* best-effort */
        }
      }
    }
    for (const connection of this.connections) {
      try {
        connection.close(1001, "runtime disposed");
      } catch {
        /* continue closing remaining sockets */
      }
    }
    this.connections.clear();
  }

  async resolvePermission(
    interactionId: string,
    decision: PermissionDecision,
  ): Promise<boolean> {
    this.markActivity();
    const pending = this.broker
      .snapshot(this.sessionId)
      .find((interaction) => interaction.interactionId === interactionId);
    const resolved = await this.broker.resolvePermission(
      interactionId,
      decision,
    );
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

  async resolveQuestion(
    interactionId: string,
    answers: QuestionAnswers,
  ): Promise<boolean> {
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
    return buildCommandCandidates(this.workDir);
  }

  private async startNewSession(): Promise<string> {
    const session = await this.stores.sessions.createAndSetCurrent(
      this.workspaceId,
    );
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

  /**
   * Handles a slash command entered via a `run` message. Reliably supported
   * commands run against the in-process stack; `/skill` is rewritten into a
   * normal agent turn; everything else returns an explicit unsupported result.
   */
  async handleCommand(input: string, requestId: string): Promise<void> {
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
      this.sendCommandResult(requestId, name, true, {
        result: { connected: handle.mcpManager?.connectedServers() ?? [] },
      });
      return;
    }
    if (name === "status") {
      this.sendCommandResult(requestId, name, true, {
        result: {
          contextWindow: handle.contextWindow,
          permissionMode: this.workspace.permissionMode,
          sessionId: this.sessionId,
          toolCount: handle.registry.listTools().length,
        },
      });
      return;
    }
    if (name === "clear") {
      await this.runLockedTask(async () => {
        handle.conv.reset();
        await this.startNewSession();
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
        // Mirrors the Agent loop's own compaction: schemas are rendered for the
        // client's wire protocol (raw tool.schema() is Anthropic-shaped and
        // would skew the token estimate on OpenAI-style clients) and narrowed
        // by the active tool filter.
        const result = await Compact.Compact.forceCompact(
          handle.conv,
          handle.client,
          handle.recoveryState,
          handle.registry.listTools().map((tool) => tool.name),
          handle.registry.getAllSchemas(
            handle.client.protocol ?? "anthropic",
            handle.toolFilter ?? undefined,
          ),
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
    const prompt = Skills.Executor.runInline(skill, rest.join(" "), {
      activateSkill: (activatedName, body) =>
        handle.activeSkills.set(activatedName, body),
    });
    this.sendCommandResult(requestId, "skill", true, {
      result: { activated: skillName },
    });
    await this.runTurn({ input: prompt, requestId, turnId: randomUUID() });
  }

  private async runRewindCommand(
    args: string,
    requestId: string,
  ): Promise<void> {
    const sha = args.trim();
    if (sha.length === 0) {
      const snapshots = await this.git.listSnapshots(this.workDir);
      this.sendCommandResult(requestId, "rewind", true, {
        result: { snapshots },
      });
      return;
    }
    const ok = await this.runLockedTask(() =>
      this.git.rewindTo(this.workDir, sha),
    );
    if (ok) this.broadcast({ paths: [], revision: sha, type: "files_changed" });
    this.sendCommandResult(requestId, "rewind", ok, {
      ...(ok ? { result: { rewoundTo: sha } } : { error: "Rewind failed" }),
    });
  }
}

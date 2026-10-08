import { describe, expect, it, vi } from "vitest";
import {
  AgentRuntime,
  parseSavedConversationMessages,
} from "../src/agent-runtime/agent-runtime.js";
import { createGitRuntime } from "../src/agent-runtime/git-runtime.js";
import {
  createInteractionBroker,
  type InteractionBroker,
} from "../src/agent-runtime/interaction-broker.js";
import { createRuntimeManager } from "../src/agent-runtime/runtime-manager.js";
import {
  type AgentStores,
  createAgentStores,
  isSessionBusyForResume,
} from "../src/agent-runtime/stores.js";
import type { AgentConnection } from "../src/agent-runtime/types.js";
import { AsyncLock } from "../src/agent-runtime/workspace-lock.js";
import type { PrismaDatabaseClient } from "../src/database/index.js";
import type { AgentSessionModel } from "../src/generated/prisma/models/AgentSession.js";
import type { AgentWorkspaceModel } from "../src/generated/prisma/models/AgentWorkspace.js";
import { createMetricsService } from "../src/observability/index.js";

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const now = new Date("2026-01-01T00:00:00.000Z");

const workspace: AgentWorkspaceModel = {
  appId: 2n,
  createTime: now,
  currentSessionId: null,
  hooksEnabled: true,
  id: 3n,
  memoryEnabled: true,
  modelOverride: null,
  permissionMode: "BYPASS_PERMISSIONS",
  sandboxEnabled: false,
  updateTime: now,
  userId: 1n,
};

const session: AgentSessionModel = {
  activeSkills: [],
  completedTime: null,
  context: {},
  createTime: now,
  id: "11111111-1111-4111-8111-111111111111",
  lastActiveTime: now,
  lastEventSequence: 0n,
  runtimeMetadata: {},
  status: "IDLE",
  updateTime: now,
  workspaceId: workspace.id,
};

const connection = (send = vi.fn()): AgentConnection => ({
  close: vi.fn(),
  id: crypto.randomUUID(),
  readOnly: false,
  send,
  userId: workspace.userId,
});

describe("AsyncLock", () => {
  it("drains queued work and keeps the chain alive after a rejection", async () => {
    const lock = new AsyncLock();
    const gate = deferred<void>();
    const order: string[] = [];

    const first = lock.run(async () => {
      order.push("first:start");
      await gate.promise;
      order.push("first:end");
    });
    const failed = lock.run(async () => {
      order.push("failed");
      throw new Error("expected failure");
    });
    const failureAssertion = expect(failed).rejects.toThrow("expected failure");
    const third = lock.run(async () => {
      order.push("third");
    });
    const drained = lock.drain().then(() => {
      order.push("drained");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    gate.resolve();

    await Promise.all([first, failureAssertion, third, drained]);
    expect(order).toEqual([
      "first:start",
      "first:end",
      "failed",
      "third",
      "drained",
    ]);
    await expect(lock.run(async () => "still usable")).resolves.toBe(
      "still usable",
    );
  });
});

describe("runtime manager lifecycle", () => {
  it("single-flights creation and waits for invalidation disposal before replacement", async () => {
    const firstWorkspace = deferred<AgentWorkspaceModel>();
    const upsert = vi
      .fn()
      .mockImplementationOnce(() => firstWorkspace.promise)
      .mockResolvedValue(workspace);
    const manager = createRuntimeManager({
      db: { agentWorkspace: { upsert } } as unknown as PrismaDatabaseClient,
      idleMs: 60_000,
      metrics: createMetricsService(),
      projectRootDir: "/tmp/yukino-runtime-manager-test",
    });

    const firstRequest = manager.getOrCreate(workspace.userId, workspace.appId);
    const concurrentRequest = manager.getOrCreate(
      workspace.userId,
      workspace.appId,
    );
    await Promise.resolve();
    expect(upsert).toHaveBeenCalledTimes(1);

    firstWorkspace.resolve(workspace);
    const [firstRuntime, concurrentRuntime] = await Promise.all([
      firstRequest,
      concurrentRequest,
    ]);
    expect(concurrentRuntime).toBe(firstRuntime);

    const disposal = deferred<void>();
    const disposeSpy = vi
      .spyOn(firstRuntime, "dispose")
      .mockImplementation(() => disposal.promise);
    const invalidation = manager.invalidate(workspace.userId, workspace.appId);
    await Promise.resolve();
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    const replacementRequest = manager.getOrCreate(
      workspace.userId,
      workspace.appId,
    );
    await Promise.resolve();
    expect(upsert).toHaveBeenCalledTimes(1);

    disposal.resolve();
    await invalidation;
    const replacement = await replacementRequest;
    expect(replacement).not.toBe(firstRuntime);
    expect(upsert).toHaveBeenCalledTimes(2);

    await manager.disposeAll();
  });

  it("disposeAll converges with an in-flight creation and stops new admission", async () => {
    const pendingWorkspace = deferred<AgentWorkspaceModel>();
    const upsert = vi.fn(() => pendingWorkspace.promise);
    const manager = createRuntimeManager({
      db: { agentWorkspace: { upsert } } as unknown as PrismaDatabaseClient,
      idleMs: 60_000,
      metrics: createMetricsService(),
      projectRootDir: "/tmp/yukino-runtime-manager-shutdown-test",
    });

    const creation = manager.getOrCreate(workspace.userId, workspace.appId);
    const creationAssertion = expect(creation).rejects.toThrow(
      "Runtime manager is disposing",
    );
    await Promise.resolve();
    expect(upsert).toHaveBeenCalledTimes(1);

    const firstDispose = manager.disposeAll();
    const secondDispose = manager.disposeAll();
    expect(secondDispose).toBe(firstDispose);
    pendingWorkspace.resolve(workspace);

    await Promise.all([creationAssertion, firstDispose]);
    await expect(
      manager.getOrCreate(workspace.userId, workspace.appId),
    ).rejects.toThrow("Runtime manager is disposing");
  });
});

describe("agent store transactions", () => {
  it("creates an IDLE session and assigns it to the workspace in one transaction", async () => {
    const order: string[] = [];
    const transactionClient = {
      agentSession: {
        create: vi.fn(async () => {
          order.push("create-session");
          return session;
        }),
      },
      agentWorkspace: {
        update: vi.fn(async () => {
          order.push("set-current-session");
          return workspace;
        }),
      },
    };
    const transaction = vi.fn(
      (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    );
    const stores = createAgentStores({
      $transaction: transaction,
    } as unknown as PrismaDatabaseClient);

    await expect(
      stores.sessions.createAndSetCurrent(workspace.id),
    ).resolves.toBe(session);
    expect(transactionClient.agentSession.create).toHaveBeenCalledWith({
      data: { status: "IDLE", workspaceId: workspace.id },
    });
    expect(transactionClient.agentWorkspace.update).toHaveBeenCalledWith({
      data: { currentSessionId: session.id },
      where: { id: workspace.id },
    });
    expect(order).toEqual(["create-session", "set-current-session"]);
  });

  it("increments the DB sequence before inserting the transcript event in one transaction", async () => {
    const order: string[] = [];
    const event = {
      createTime: now,
      id: 1n,
      kind: "assistant_message",
      payload: { text: "done" },
      sequence: 8n,
      sessionId: session.id,
      turnId: null,
    };
    const transactionClient = {
      agentSession: {
        update: vi.fn(async () => {
          order.push("increment-sequence");
          return { lastEventSequence: event.sequence };
        }),
      },
      agentTranscriptEvent: {
        create: vi.fn(async () => {
          order.push("insert-event");
          return event;
        }),
      },
    };
    const transaction = vi.fn(
      (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    );
    const stores = createAgentStores({
      $transaction: transaction,
    } as unknown as PrismaDatabaseClient);

    await expect(
      stores.transcript.appendNext({
        kind: event.kind,
        payload: event.payload,
        sessionId: event.sessionId,
        turnId: event.turnId,
      }),
    ).resolves.toBe(event);
    expect(transactionClient.agentSession.update).toHaveBeenCalledWith({
      data: { lastEventSequence: { increment: 1 } },
      select: { lastEventSequence: true },
      where: { id: session.id },
    });
    expect(transactionClient.agentTranscriptEvent.create).toHaveBeenCalledWith({
      data: {
        kind: event.kind,
        payload: event.payload,
        sequence: event.sequence,
        sessionId: event.sessionId,
        turnId: event.turnId,
      },
    });
    expect(order).toEqual(["increment-sequence", "insert-event"]);
  });
});

describe("AgentRuntime concurrency", () => {
  it("single-flights session creation across concurrent ready calls", async () => {
    const created = deferred<AgentSessionModel>();
    const createAndSetCurrent = vi.fn(() => created.promise);
    const cancelPending = vi.fn().mockResolvedValue({ count: 0 });
    const stores = {
      interactions: { cancelPending },
      sessions: { createAndSetCurrent, findById: vi.fn() },
    } as unknown as AgentStores;
    const runtime = new AgentRuntime({
      appId: workspace.appId,
      git: createGitRuntime(),
      metrics: createMetricsService(),
      stores,
      workDir: "/tmp/yukino-agent-runtime-test",
      workspace,
    });
    const firstSend = vi.fn();
    const secondSend = vi.fn();

    const firstReady = runtime.ready(connection(firstSend));
    const secondReady = runtime.ready(connection(secondSend));
    expect(createAndSetCurrent).toHaveBeenCalledTimes(1);

    created.resolve(session);
    await Promise.all([firstReady, secondReady]);
    expect(firstSend).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: session.id }),
    );
    expect(secondSend).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: session.id }),
    );

    await runtime.dispose();
  });

  it("shares disposal, drains active file work, and rejects new work", async () => {
    const stores = {
      interactions: { cancelPending: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as AgentStores;
    const runtime = new AgentRuntime({
      appId: workspace.appId,
      git: createGitRuntime(),
      metrics: createMetricsService(),
      stores,
      workDir: "/tmp/yukino-agent-runtime-dispose-test",
      workspace,
    });
    const started = deferred<void>();
    const release = deferred<void>();
    const work = runtime.runExclusive(async () => {
      started.resolve();
      await release.promise;
    });
    await started.promise;
    expect(runtime.isBusy).toBe(true);

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    expect(secondDispose).toBe(firstDispose);
    await expect(runtime.runExclusive(async () => undefined)).rejects.toThrow(
      "Agent runtime is disposing",
    );

    let disposed = false;
    void firstDispose.then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);

    release.resolve();
    await Promise.all([work, firstDispose]);
    expect(runtime.isBusy).toBe(false);
  });
});

describe("interaction broker consistency", () => {
  it("keeps a permission pending when the database answer fails", async () => {
    const answer = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({});
    const stores = {
      interactions: {
        answer,
        cancelPending: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "permission-1" }),
      },
    } as unknown as AgentStores;
    const broker = createInteractionBroker(stores, 60_000);
    const request = await broker.requestPermission({
      payload: {
        args: {},
        description: "write",
        reason: "test",
        toolName: "write",
      },
      sessionId: "session-a",
      turnId: null,
    });

    await expect(
      broker.resolvePermission(request.interactionId, "allow"),
    ).rejects.toThrow("database unavailable");
    expect(broker.hasPending()).toBe(true);

    await expect(
      broker.resolvePermission(request.interactionId, "allow"),
    ).resolves.toBe(true);
    await expect(request.decision).resolves.toBe("allow");
    expect(broker.hasPending()).toBe(false);
  });

  it("keeps a question pending when the database answer fails", async () => {
    const answer = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({});
    const stores = {
      interactions: {
        answer,
        cancelPending: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "question-1" }),
      },
    } as unknown as AgentStores;
    const broker = createInteractionBroker(stores, 60_000);
    const request = await broker.requestQuestions({
      questions: [
        {
          header: "Choice",
          multiSelect: false,
          options: [],
          question: "Continue?",
        },
      ],
      sessionId: "session-a",
      turnId: null,
    });

    await expect(
      broker.resolveQuestion(request.interactionId, { "Continue?": "yes" }),
    ).rejects.toThrow("database unavailable");
    expect(broker.hasPending()).toBe(true);

    await expect(
      broker.resolveQuestion(request.interactionId, { "Continue?": "yes" }),
    ).resolves.toBe(true);
    await expect(request.answers).resolves.toEqual({ "Continue?": "yes" });
    expect(broker.hasPending()).toBe(false);
  });

  it("cancels only pending interactions for the target session", async () => {
    let nextId = 0;
    const cancelPending = vi.fn().mockResolvedValue({ count: 1 });
    const stores = {
      interactions: {
        answer: vi.fn().mockResolvedValue({}),
        cancelPending,
        create: vi.fn().mockImplementation(() => {
          nextId += 1;
          return Promise.resolve({ id: `permission-${String(nextId)}` });
        }),
      },
    } as unknown as AgentStores;
    const broker = createInteractionBroker(stores, 60_000);
    const first = await broker.requestPermission({
      payload: {
        args: {},
        description: "first",
        reason: "test",
        toolName: "write",
      },
      sessionId: "session-a",
      turnId: null,
    });
    const second = await broker.requestPermission({
      payload: {
        args: {},
        description: "second",
        reason: "test",
        toolName: "write",
      },
      sessionId: "session-b",
      turnId: null,
    });

    await broker.cancelSession("session-a");
    await expect(first.decision).resolves.toBe("deny");
    expect(cancelPending).toHaveBeenCalledWith("session-a");
    expect(broker.hasPending()).toBe(true);

    await expect(
      broker.resolvePermission(second.interactionId, "allow"),
    ).resolves.toBe(true);
    await expect(second.decision).resolves.toBe("allow");
    expect(broker.hasPending()).toBe(false);
  });

  it("snapshots the original pending permission and question payloads by session", async () => {
    let nextId = 0;
    const stores = {
      interactions: {
        answer: vi.fn().mockResolvedValue({}),
        cancelPending: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(() => {
          nextId += 1;
          return Promise.resolve({
            id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
          });
        }),
      },
    } as unknown as AgentStores;
    const broker = createInteractionBroker(stores, 60_000);
    const permission = await broker.requestPermission({
      payload: {
        args: { path: "src/App.tsx" },
        description: "Write a file",
        reason: "requested",
        toolName: "write",
      },
      sessionId: session.id,
      turnId: "22222222-2222-4222-8222-222222222222",
    });
    const question = await broker.requestQuestions({
      questions: [
        {
          header: "Choice",
          multiSelect: false,
          options: [],
          question: "Continue?",
        },
      ],
      sessionId: session.id,
      turnId: null,
    });

    expect(broker.snapshot(session.id)).toEqual([
      {
        interactionId: permission.interactionId,
        request: {
          args: { path: "src/App.tsx" },
          description: "Write a file",
          reason: "requested",
          toolName: "write",
        },
        sessionId: session.id,
        turnId: "22222222-2222-4222-8222-222222222222",
        type: "permission",
      },
      {
        interactionId: question.interactionId,
        questions: [
          {
            header: "Choice",
            multiSelect: false,
            options: [],
            question: "Continue?",
          },
        ],
        sessionId: session.id,
        type: "question",
      },
    ]);

    await broker.cancelSession(session.id);
    await expect(permission.decision).resolves.toBe("deny");
    await expect(question.answers).rejects.toThrow("Interaction cancelled");
  });
});

describe("phase 6 runtime recovery", () => {
  it("cancels stale DB interactions without cancelling a live broker promise", async () => {
    const staleSession = { ...session, status: "WAITING" as const };
    const replayWorkspace = { ...workspace, currentSessionId: staleSession.id };
    const cancelPending = vi.fn().mockResolvedValue({ count: 1 });
    const updateStatus = vi
      .fn()
      .mockResolvedValue({ ...staleSession, status: "IDLE" });
    const stores = {
      interactions: {
        answer: vi.fn().mockResolvedValue({}),
        cancelPending,
        create: vi
          .fn()
          .mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" }),
      },
      sessions: {
        findById: vi.fn().mockResolvedValue(staleSession),
        updateStatus,
      },
    } as unknown as AgentStores;
    const runtime = new AgentRuntime({
      appId: workspace.appId,
      git: createGitRuntime(),
      metrics: createMetricsService(),
      stores,
      workDir: "/tmp/yukino-agent-stale-interaction-test",
      workspace: replayWorkspace,
    });

    await runtime.ready(connection());
    expect(cancelPending).toHaveBeenCalledTimes(1);
    expect(cancelPending).toHaveBeenCalledWith(staleSession.id);
    expect(updateStatus).toHaveBeenCalledWith(staleSession.id, "IDLE");

    const broker = (runtime as unknown as { broker: InteractionBroker }).broker;
    const live = await broker.requestPermission({
      payload: {
        args: {},
        description: "Write",
        reason: "requested",
        toolName: "write",
      },
      sessionId: staleSession.id,
      turnId: null,
    });
    expect(broker.snapshot(staleSession.id)).toHaveLength(1);
    await expect(
      broker.resolvePermission(live.interactionId, "allow"),
    ).resolves.toBe(true);
    await expect(live.decision).resolves.toBe("allow");
    await runtime.dispose();
  });

  it("replays 2500 events in bounded pages against one high-watermark", async () => {
    const replaySession = { ...session, lastEventSequence: 2_500n };
    const replayWorkspace = {
      ...workspace,
      currentSessionId: replaySession.id,
    };
    const events = Array.from({ length: 2_500 }, (_, index) => ({
      createTime: now,
      id: BigInt(index + 1),
      kind: "assistant_message",
      payload: { text: `event-${String(index + 1)}` },
      sequence: BigInt(index + 1),
      sessionId: replaySession.id,
      turnId: null,
    }));
    const listAfter = vi.fn(
      (
        _sessionId: string,
        after: bigint,
        highWatermark: bigint,
        limit: number,
      ) =>
        Promise.resolve(
          events
            .filter(
              (event) =>
                event.sequence > after && event.sequence <= highWatermark,
            )
            .slice(0, limit),
        ),
    );
    const stores = {
      interactions: { cancelPending: vi.fn().mockResolvedValue({ count: 0 }) },
      sessions: { findById: vi.fn().mockResolvedValue(replaySession) },
      transcript: { listAfter },
    } as unknown as AgentStores;
    const runtime = new AgentRuntime({
      appId: workspace.appId,
      git: createGitRuntime(),
      metrics: createMetricsService(),
      stores,
      workDir: "/tmp/yukino-agent-backlog-test",
      workspace: replayWorkspace,
    });
    const send = vi.fn();

    await runtime.sendBacklog(connection(send), 0n);

    const batches = send.mock.calls.map(([message]) => message);
    expect(batches.map((message) => message.events.length)).toEqual([
      1_000, 1_000, 500,
    ]);
    expect(batches.map((message) => message.complete)).toEqual([
      false,
      false,
      true,
    ]);
    expect(batches.every((message) => message.highWatermark === "2500")).toBe(
      true,
    );
    expect(listAfter).toHaveBeenNthCalledWith(
      1,
      replaySession.id,
      0n,
      2_500n,
      1_000,
    );
    expect(listAfter).toHaveBeenNthCalledWith(
      3,
      replaySession.id,
      2_000n,
      2_500n,
      1_000,
    );
    await runtime.dispose();
  });

  it("broadcasts interaction resolution after a durable answer", async () => {
    const replayWorkspace = { ...workspace, currentSessionId: session.id };
    const stores = {
      interactions: {
        answer: vi.fn().mockResolvedValue({}),
        cancelPending: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi
          .fn()
          .mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" }),
      },
      sessions: { findById: vi.fn().mockResolvedValue(session) },
    } as unknown as AgentStores;
    const runtime = new AgentRuntime({
      appId: workspace.appId,
      git: createGitRuntime(),
      metrics: createMetricsService(),
      stores,
      workDir: "/tmp/yukino-agent-interaction-ack-test",
      workspace: replayWorkspace,
    });
    const firstSend = vi.fn();
    const secondSend = vi.fn();
    runtime.addConnection(connection(firstSend));
    runtime.addConnection(connection(secondSend));
    await runtime.ready(connection());
    const broker = (runtime as unknown as { broker: InteractionBroker }).broker;
    const request = await broker.requestPermission({
      payload: {
        args: {},
        description: "Write",
        reason: "requested",
        toolName: "write",
      },
      sessionId: session.id,
      turnId: null,
    });

    await expect(
      runtime.resolvePermission(request.interactionId, "allow"),
    ).resolves.toBe(true);
    await expect(request.decision).resolves.toBe("allow");
    const acknowledgement = {
      interactionId: request.interactionId,
      outcome: "allowed",
      sessionId: session.id,
      type: "interaction_resolved",
    };
    expect(firstSend).toHaveBeenCalledWith(acknowledgement);
    expect(secondSend).toHaveBeenCalledWith(acknowledgement);
    await runtime.dispose();
  });

  it("parses valid saved conversations and rejects invalid old context", () => {
    expect(
      parseSavedConversationMessages({
        messages: [
          { role: "user", content: "Build it" },
          {
            role: "assistant",
            content: "Working",
            thinkingBlocks: [{ thinking: "plan", signature: "sig" }],
            toolUses: [
              {
                toolUseId: "tool-1",
                toolName: "write",
                arguments: { path: "a" },
              },
            ],
          },
          {
            role: "user",
            content: "",
            toolResults: [
              { toolUseId: "tool-1", content: "ok", isError: false },
            ],
          },
        ],
      }),
    ).toHaveLength(3);
    expect(
      parseSavedConversationMessages({
        messages: [{ role: "legacy", content: 42 }],
      }),
    ).toBeNull();
    expect(parseSavedConversationMessages({ transcript: [] })).toBeNull();
  });
});

describe("session resume status matrix", () => {
  it.each([
    ["IDLE", false],
    ["COMPLETED", false],
    ["ABORTED", false],
    ["FAILED", false],
    ["RUNNING", true],
    ["WAITING", true],
  ] as const)("classifies %s busy=%s", (status, expected) => {
    expect(isSessionBusyForResume(status)).toBe(expected);
  });

  it.each(["IDLE", "COMPLETED", "ABORTED", "FAILED"] as const)(
    "resets %s to IDLE before changing current session",
    async (status) => {
      const order: string[] = [];
      const candidate = {
        ...session,
        completedTime: status === "COMPLETED" ? now : null,
        status,
      };
      const resumed = {
        ...candidate,
        completedTime: null,
        status: "IDLE" as const,
      };
      const transactionClient = {
        agentSession: {
          findUnique: vi.fn().mockResolvedValue(candidate),
          update: vi.fn(async () => {
            order.push("reset-session");
            return resumed;
          }),
        },
        agentWorkspace: {
          update: vi.fn(async () => {
            order.push("set-current-session");
            return workspace;
          }),
        },
      };
      const stores = createAgentStores({
        $transaction: vi.fn(
          (callback: (client: typeof transactionClient) => Promise<unknown>) =>
            callback(transactionClient),
        ),
      } as unknown as PrismaDatabaseClient);

      await expect(
        stores.sessions.resumeAndSetCurrent(workspace.id, candidate.id),
      ).resolves.toEqual({ outcome: "resumed", session: resumed });
      expect(transactionClient.agentSession.update).toHaveBeenCalledWith({
        data: {
          completedTime: null,
          lastActiveTime: expect.any(Date),
          status: "IDLE",
        },
        where: { id: candidate.id },
      });
      expect(order).toEqual(["reset-session", "set-current-session"]);
    },
  );

  it.each(["RUNNING", "WAITING"] as const)(
    "rejects %s without changing the workspace",
    async (status) => {
      const candidate = { ...session, status };
      const transactionClient = {
        agentSession: {
          findUnique: vi.fn().mockResolvedValue(candidate),
          update: vi.fn(),
        },
        agentWorkspace: { update: vi.fn() },
      };
      const stores = createAgentStores({
        $transaction: vi.fn(
          (callback: (client: typeof transactionClient) => Promise<unknown>) =>
            callback(transactionClient),
        ),
      } as unknown as PrismaDatabaseClient);

      await expect(
        stores.sessions.resumeAndSetCurrent(workspace.id, candidate.id),
      ).resolves.toEqual({ outcome: "busy", session: candidate });
      expect(transactionClient.agentSession.update).not.toHaveBeenCalled();
      expect(transactionClient.agentWorkspace.update).not.toHaveBeenCalled();
    },
  );
});

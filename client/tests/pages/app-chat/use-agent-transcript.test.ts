import { describe, expect, it } from "vitest";
import {
  agentTranscriptReducer,
  compareAgentSequences,
  initialAgentTranscriptState,
  isAgentBusy,
  type AgentRuntimeStatus,
  type AgentTranscriptAction,
  type AgentTranscriptEvent,
  type AgentTranscriptState,
} from "@/pages/app-chat/use-agent-transcript";

function reduce(
  actions: readonly AgentTranscriptAction[],
  start: AgentTranscriptState = initialAgentTranscriptState,
): AgentTranscriptState {
  return actions.reduce(agentTranscriptReducer, start);
}

function makeEvent(
  sequence: string,
  kind = "tool_use",
  extra: Partial<AgentTranscriptEvent> = {},
): AgentTranscriptEvent {
  return {
    sequence,
    sessionId: "session-1",
    turnId: "turn-1",
    kind,
    payload: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...extra,
  };
}

function ready(
  sessionId = "session-1",
  highWatermark = "0",
  overrides: Partial<Extract<AgentTranscriptAction, { type: "ready" }>> = {},
): Extract<AgentTranscriptAction, { type: "ready" }> {
  return {
    type: "ready",
    sessionId,
    highWatermark,
    readOnly: false,
    permissionMode: "default",
    runtimeStatus: "idle",
    currentTurnId: undefined,
    pendingPermission: undefined,
    pendingQuestion: undefined,
    ...overrides,
  };
}

describe("compareAgentSequences", () => {
  it("orders decimal strings without converting them to Number", () => {
    expect(compareAgentSequences("9", "10")).toBe(-1);
    expect(compareAgentSequences("1000", "999")).toBe(1);
    expect(compareAgentSequences("42", "43")).toBe(-1);
    expect(compareAgentSequences("123456789", "123456789")).toBe(0);
  });
});

describe("isAgentBusy", () => {
  it("is true only for running and waiting", () => {
    expect(isAgentBusy("running")).toBe(true);
    expect(isAgentBusy("waiting")).toBe(true);
    const idle: AgentRuntimeStatus[] = ["idle", "stopped", "error"];
    for (const status of idle) expect(isAgentBusy(status)).toBe(false);
  });
});

describe("agentTranscriptReducer", () => {
  it("does not advance the applied cursor from ready's replay target", () => {
    const next = agentTranscriptReducer(
      initialAgentTranscriptState,
      ready("session-1", "42", {
        currentTurnId: "turn-1",
        readOnly: true,
        runtimeStatus: "running",
      }),
    );

    expect(next.sessionId).toBe("session-1");
    expect(next.lastSequence).toBe("0");
    expect(next.replayHighWatermark).toBe("42");
    expect(next.replaying).toBe(true);
    expect(next.runtimeStatus).toBe("running");
    expect(next.currentTurnId).toBe("turn-1");
  });

  it("buffers out-of-order live events until the gap is filled", () => {
    const withGap = reduce([
      ready("session-1", "3"),
      { type: "event", event: makeEvent("3") },
      {
        type: "transcript_batch",
        sessionId: "session-1",
        highWatermark: "3",
        complete: false,
        events: [makeEvent("1")],
      },
    ]);

    expect(withGap.lastSequence).toBe("1");
    expect(withGap.events.map((event) => event.sequence)).toEqual(["1"]);
    expect(withGap.pendingEvents.map((event) => event.sequence)).toEqual(["3"]);
    expect(withGap.replaying).toBe(true);

    const filled = agentTranscriptReducer(withGap, {
      type: "event",
      event: makeEvent("2"),
    });
    expect(filled.lastSequence).toBe("3");
    expect(filled.events.map((event) => event.sequence)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filled.pendingEvents).toEqual([]);
    expect(filled.replaying).toBe(true);

    const completed = agentTranscriptReducer(filled, {
      type: "transcript_batch",
      sessionId: "session-1",
      highWatermark: "3",
      complete: true,
      events: [],
    });
    expect(completed.replaying).toBe(false);
  });

  it("does not finish replay before the complete batch", () => {
    const state = reduce([
      ready("session-1", "1"),
      { type: "event", event: makeEvent("1") },
    ]);
    expect(state.lastSequence).toBe("1");
    expect(state.replaying).toBe(true);

    const completed = agentTranscriptReducer(state, {
      type: "transcript_batch",
      sessionId: "session-1",
      highWatermark: "1",
      complete: true,
      events: [],
    });
    expect(completed.replaying).toBe(false);
  });

  it("deduplicates repeated events by session and sequence", () => {
    const state = reduce([
      ready("session-1", "1"),
      {
        type: "transcript_batch",
        sessionId: "session-1",
        highWatermark: "1",
        complete: true,
        events: [makeEvent("1", "tool_use", { payload: "first" })],
      },
      {
        type: "event",
        event: makeEvent("1", "tool_use", { payload: "duplicate" }),
      },
    ]);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.payload).toBe("first");
    expect(state.lastSequence).toBe("1");
  });

  it("clears transcript, cursor, buffers, and old interactions on session change", () => {
    const request = {
      interactionId: "permission-1",
      turnId: "turn-1",
      toolName: "write",
      args: null,
      description: "Write a file",
      reason: "requested",
    };
    const firstSession = reduce([
      ready("session-1", "1"),
      {
        type: "transcript_batch",
        sessionId: "session-1",
        highWatermark: "1",
        complete: true,
        events: [makeEvent("1")],
      },
      { type: "permission_request", sessionId: "session-1", request },
    ]);

    const switched = agentTranscriptReducer(
      firstSession,
      ready("session-2", "0"),
    );
    expect(switched.sessionId).toBe("session-2");
    expect(switched.lastSequence).toBe("0");
    expect(switched.events).toEqual([]);
    expect(switched.pendingEvents).toEqual([]);
    expect(switched.pendingPermission).toBeUndefined();
  });

  it("restores pending interactions from ready and clears only after acknowledgement", () => {
    const permission = {
      interactionId: "permission-1",
      turnId: "turn-1",
      toolName: "write",
      args: { path: "src/App.tsx" },
      description: "Write a file",
      reason: "requested",
    };
    const waiting = agentTranscriptReducer(
      initialAgentTranscriptState,
      ready("session-1", "0", {
        currentTurnId: "turn-1",
        pendingPermission: permission,
        runtimeStatus: "waiting",
      }),
    );
    expect(waiting.pendingPermission).toEqual(permission);

    const wrongSession = agentTranscriptReducer(waiting, {
      type: "interaction_resolved",
      interactionId: permission.interactionId,
      sessionId: "session-2",
    });
    expect(wrongSession.pendingPermission).toEqual(permission);

    const resolved = agentTranscriptReducer(waiting, {
      type: "interaction_resolved",
      interactionId: permission.interactionId,
      sessionId: "session-1",
    });
    expect(resolved.pendingPermission).toBeUndefined();
  });

  it("ignores events and batches from another session", () => {
    const state = reduce([
      ready("session-1", "1"),
      {
        type: "event",
        event: makeEvent("1", "tool_use", { sessionId: "session-2" }),
      },
      {
        type: "transcript_batch",
        sessionId: "session-2",
        highWatermark: "1",
        complete: true,
        events: [makeEvent("1", "tool_use", { sessionId: "session-2" })],
      },
    ]);
    expect(state.lastSequence).toBe("0");
    expect(state.events).toEqual([]);
    expect(state.replaying).toBe(true);
  });

  it("clears ephemeral buffers only when contiguous boundary events apply", () => {
    const state = reduce([
      ready("session-1", "2"),
      { type: "assistant_delta", text: "answer" },
      { type: "thinking_delta", text: "thought" },
      { type: "event", event: makeEvent("2", "assistant_message") },
    ]);
    expect(state.streamingText).toBe("answer");

    const filled = agentTranscriptReducer(state, {
      type: "event",
      event: makeEvent("1", "tool_use"),
    });
    expect(filled.streamingText).toBe("");
    expect(filled.thinkingText).toBe("");
  });

  it("updates runtime status and clears the current turn at idle", () => {
    const running = reduce([
      ready("session-1", "0"),
      {
        type: "runtime_status",
        status: "running",
        turnId: "turn-1",
        detail: "working",
      },
    ]);
    expect(running.currentTurnId).toBe("turn-1");

    const idle = agentTranscriptReducer(running, {
      type: "runtime_status",
      status: "idle",
      turnId: undefined,
      detail: undefined,
    });
    expect(idle.runtimeStatus).toBe("idle");
    expect(idle.currentTurnId).toBeUndefined();
  });

  it("caps command results and errors while preserving reset connection data", () => {
    const actions: AgentTranscriptAction[] = Array.from(
      { length: 25 },
      (_, index) => ({
        type: "error",
        message: `err-${String(index)}`,
        code: undefined,
      }),
    );
    const withErrors = reduce(actions);
    expect(withErrors.errors).toHaveLength(20);

    const candidates = [
      { name: "/run", description: "Run", aliases: [], type: "local" },
    ];
    const reset = reduce(
      [
        { type: "connection_changed", state: "connected" },
        { type: "candidates", candidates },
        { type: "reset" },
      ],
      withErrors,
    );
    expect(reset.connectionState).toBe("connected");
    expect(reset.candidates).toEqual(candidates);
    expect(reset.lastSequence).toBe("0");
  });
});

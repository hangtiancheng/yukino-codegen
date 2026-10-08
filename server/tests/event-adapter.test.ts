import type { Agent } from "@yukino.js/yukino";
import { describe, expect, it } from "vitest";
import { createEventAdapter } from "../src/agent-runtime/event-adapter.js";

// Narrow helper so a single mapEvent output can be asserted concisely.
const first = (
  adapter: ReturnType<typeof createEventAdapter>,
  event: Agent.Events.AgentEvent,
) => {
  const out = adapter.mapEvent(event);
  expect(out).toHaveLength(1);
  const item = out[0];
  if (item === undefined) throw new Error("expected exactly one output");
  return item;
};

describe("createEventAdapter - initial state", () => {
  it("starts pending with zero usage and no error", () => {
    const adapter = createEventAdapter();
    expect(adapter.outcome()).toBe("pending");
    expect(adapter.usage()).toEqual({ input: 0, output: 0 });
    expect(adapter.narration()).toBe("");
    expect(adapter.errorMessage()).toBeUndefined();
  });
});

describe("createEventAdapter - stream_text and narration", () => {
  it("emits ephemeral assistant_delta and accumulates trimmed narration", () => {
    const adapter = createEventAdapter();
    const out = first(adapter, { type: "stream_text", text: "Hello " });
    expect(out).toEqual({
      persist: false,
      message: { type: "assistant_delta", payload: { text: "Hello " } },
    });
    adapter.mapEvent({ type: "stream_text", text: "world" });
    expect(adapter.narration()).toBe("Hello world");
  });
});

describe("createEventAdapter - thinking", () => {
  it("emits ephemeral agent_status for thinking_text", () => {
    const adapter = createEventAdapter();
    expect(
      first(adapter, { type: "thinking_text", text: "pondering" }),
    ).toEqual({
      persist: false,
      message: {
        type: "agent_status",
        payload: { phase: "thinking", text: "pondering" },
      },
    });
  });

  it("persists thinking_complete as a thinking transcript event", () => {
    const adapter = createEventAdapter();
    expect(
      first(adapter, {
        type: "thinking_complete",
        thinking: "chain",
        signature: "sig",
      }),
    ).toEqual({
      persist: true,
      kind: "thinking",
      payload: { thinking: "chain" },
    });
  });
});

describe("createEventAdapter - tool_use", () => {
  it("persists tool_use with a detail extracted from known arg keys", () => {
    const adapter = createEventAdapter();
    const out = first(adapter, {
      type: "tool_use",
      toolName: "Read",
      toolId: "t1",
      args: { file_path: "/repo/src/App.tsx", extra: 1 },
    });
    expect(out).toEqual({
      persist: true,
      kind: "tool_use",
      payload: {
        args: { file_path: "/repo/src/App.tsx", extra: 1 },
        toolId: "t1",
        toolName: "Read",
        detail: "/repo/src/App.tsx",
      },
    });
  });

  it("omits detail when no known key holds a non-empty string", () => {
    const adapter = createEventAdapter();
    const out = first(adapter, {
      type: "tool_use",
      toolName: "X",
      toolId: "t2",
      args: { foo: 123 },
    });
    if (out.persist) {
      expect("detail" in out.payload).toBe(false);
    } else {
      throw new Error("expected a persisted event");
    }
  });

  it("truncates an overlong detail to 200 chars plus an ellipsis", () => {
    const adapter = createEventAdapter();
    const longCommand = "x".repeat(300);
    const out = first(adapter, {
      type: "tool_use",
      toolName: "Bash",
      toolId: "t3",
      args: { command: longCommand },
    });
    if (!out.persist) throw new Error("expected a persisted event");
    const detail = out.payload.detail as string;
    expect(detail).toHaveLength(201);
    expect(detail.endsWith("…")).toBe(true);
  });
});

describe("createEventAdapter - tool_result", () => {
  it("persists a string output", () => {
    const adapter = createEventAdapter();
    expect(
      first(adapter, {
        type: "tool_result",
        toolName: "Bash",
        toolId: "t4",
        output: "done",
        isError: false,
        elapsed: 12,
      }),
    ).toEqual({
      persist: true,
      kind: "tool_result",
      payload: {
        elapsed: 12,
        isError: false,
        output: "done",
        toolId: "t4",
        toolName: "Bash",
      },
    });
  });

  it("collapses whitespace in the pre-flattened output text", () => {
    const adapter = createEventAdapter();
    const out = first(adapter, {
      type: "tool_result",
      toolName: "Grep",
      toolId: "t5",
      output: "line1\nline2",
      isError: true,
      elapsed: 3,
    });
    if (!out.persist) throw new Error("expected a persisted event");
    expect(out.payload.output).toBe("line1 line2");
    expect(out.payload.isError).toBe(true);
  });
});

describe("createEventAdapter - usage totals", () => {
  it("persists per-event usage and accumulates totals", () => {
    const adapter = createEventAdapter();
    const usage = (
      inputTokens: number,
      outputTokens: number,
    ): Agent.Events.AgentEvent => ({
      type: "usage",
      usage: {
        inputTokens,
        outputTokens,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    });
    expect(first(adapter, usage(10, 5))).toEqual({
      persist: true,
      kind: "usage",
      payload: { inputTokens: 10, outputTokens: 5 },
    });
    adapter.mapEvent(usage(7, 3));
    expect(adapter.usage()).toEqual({ input: 17, output: 8 });
  });
});

describe("createEventAdapter - outcome", () => {
  it("sets end_turn on loop_complete end_turn", () => {
    const adapter = createEventAdapter();
    expect(
      first(adapter, { type: "loop_complete", stopReason: "end_turn" }),
    ).toEqual({
      persist: true,
      kind: "loop_complete",
      payload: { stopReason: "end_turn" },
    });
    expect(adapter.outcome()).toBe("end_turn");
    expect(adapter.errorMessage()).toBeUndefined();
  });

  it("sets interrupted on loop_complete interrupted", () => {
    const adapter = createEventAdapter();
    adapter.mapEvent({ type: "loop_complete", stopReason: "interrupted" });
    expect(adapter.outcome()).toBe("interrupted");
  });

  it("sets other with an error message for an unknown stop reason", () => {
    const adapter = createEventAdapter();
    adapter.mapEvent({ type: "loop_complete", stopReason: "max_tokens" });
    expect(adapter.outcome()).toBe("other");
    expect(adapter.errorMessage()).toBe("Generation stopped: max_tokens");
  });

  it("sets error outcome and records the message on error events", () => {
    const adapter = createEventAdapter();
    expect(first(adapter, { type: "error", error: new Error("boom") })).toEqual(
      {
        persist: true,
        kind: "error",
        payload: { message: "boom" },
      },
    );
    expect(adapter.outcome()).toBe("error");
    expect(adapter.errorMessage()).toBe("boom");
  });
});

describe("createEventAdapter - misc events", () => {
  it("persists an empty turn_complete", () => {
    const adapter = createEventAdapter();
    expect(first(adapter, { type: "turn_complete" })).toEqual({
      persist: true,
      kind: "turn_complete",
      payload: {},
    });
  });

  it("emits ephemeral agent_status for permission_request", () => {
    const adapter = createEventAdapter();
    expect(
      first(adapter, {
        type: "permission_request",
        toolName: "Bash",
        args: {},
      }),
    ).toEqual({
      persist: false,
      message: {
        type: "agent_status",
        payload: { phase: "permission", toolName: "Bash" },
      },
    });
  });
});

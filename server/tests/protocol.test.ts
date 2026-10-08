import { describe, expect, it } from "vitest";
import {
  agentClientMessageSchema,
  agentServerMessageSchema,
} from "../src/agent-runtime/protocol.js";

// The client->server message union is `.strict()`, so unknown keys are rejected.

describe("agentClientMessageSchema - hello", () => {
  it("accepts a minimal hello", () => {
    expect(agentClientMessageSchema.safeParse({ type: "hello" }).success).toBe(true);
  });

  it("accepts a hello with optional requestId and numeric-string afterSequence", () => {
    expect(
      agentClientMessageSchema.safeParse({
        type: "hello",
        requestId: "req-1",
        afterSequence: "1024",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-numeric afterSequence", () => {
    expect(
      agentClientMessageSchema.safeParse({ type: "hello", afterSequence: "12a" }).success,
    ).toBe(false);
  });

  it("rejects unknown/extra fields (strict)", () => {
    expect(agentClientMessageSchema.safeParse({ type: "hello", unexpected: true }).success).toBe(
      false,
    );
  });
});

describe("agentClientMessageSchema - run", () => {
  it("accepts a valid run", () => {
    const result = agentClientMessageSchema.safeParse({
      type: "run",
      requestId: "req-2",
      input: "build me a todo app",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a run with the optional structured fields", () => {
    expect(
      agentClientMessageSchema.safeParse({
        type: "run",
        requestId: "req-3",
        input: "fix it",
        selectedElement: { tag: "div", id: "root" },
        previewError: "ReferenceError: x is not defined",
        clientFileRevision: "rev-9",
      }).success,
    ).toBe(true);
  });

  it("rejects a run missing requestId and input", () => {
    expect(agentClientMessageSchema.safeParse({ type: "run" }).success).toBe(false);
  });

  it("rejects an empty input", () => {
    expect(
      agentClientMessageSchema.safeParse({ type: "run", requestId: "r", input: "" }).success,
    ).toBe(false);
  });

  it("rejects an empty requestId", () => {
    expect(
      agentClientMessageSchema.safeParse({ type: "run", requestId: "", input: "hi" }).success,
    ).toBe(false);
  });

  it("rejects unknown/extra fields (strict)", () => {
    expect(
      agentClientMessageSchema.safeParse({
        type: "run",
        requestId: "r",
        input: "hi",
        rogue: 1,
      }).success,
    ).toBe(false);
  });
});

describe("agentClientMessageSchema - malformed", () => {
  it("rejects an unknown message type", () => {
    expect(agentClientMessageSchema.safeParse({ type: "definitely-not-a-type" }).success).toBe(
      false,
    );
  });

  it("rejects a message without a type", () => {
    expect(agentClientMessageSchema.safeParse({ requestId: "r" }).success).toBe(false);
  });

  it("validates a well-formed heartbeat but rejects a negative timestamp", () => {
    expect(agentClientMessageSchema.safeParse({ type: "heartbeat", timestamp: 100 }).success).toBe(
      true,
    );
    expect(agentClientMessageSchema.safeParse({ type: "heartbeat", timestamp: -1 }).success).toBe(
      false,
    );
  });
});

const sessionId = "11111111-1111-4111-8111-111111111111";
const turnId = "22222222-2222-4222-8222-222222222222";

const transcriptEvent = (sequence: number) => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "assistant_message",
  payload: { text: `event-${String(sequence)}` },
  sequence: String(sequence),
  sessionId,
  turnId,
});

describe("agentServerMessageSchema", () => {
  it("requires complete ready replay and pending interaction metadata", () => {
    expect(
      agentServerMessageSchema.safeParse({
        currentTurnId: turnId,
        highWatermark: "42",
        pendingInteractions: [
          {
            interactionId: "33333333-3333-4333-8333-333333333333",
            request: {
              args: { path: "src/App.tsx" },
              description: "Write a file",
              reason: "requested",
              toolName: "write",
            },
            sessionId,
            turnId,
            type: "permission",
          },
        ],
        permissionMode: "DEFAULT",
        readOnly: false,
        runtimeStatus: "waiting",
        sessionId,
        type: "ready",
      }).success,
    ).toBe(true);
    expect(
      agentServerMessageSchema.safeParse({
        permissionMode: "DEFAULT",
        readOnly: false,
        sessionId,
        type: "ready",
      }).success,
    ).toBe(false);
  });

  it("requires session replay metadata and caps batches at 1000 events", () => {
    expect(
      agentServerMessageSchema.safeParse({
        complete: true,
        events: [transcriptEvent(1)],
        highWatermark: "1",
        sessionId,
        type: "transcript_batch",
      }).success,
    ).toBe(true);
    expect(
      agentServerMessageSchema.safeParse({
        complete: false,
        events: Array.from({ length: 1_001 }, (_, index) => transcriptEvent(index + 1)),
        highWatermark: "1001",
        sessionId,
        type: "transcript_batch",
      }).success,
    ).toBe(false);
  });

  it("accepts interaction resolution broadcasts", () => {
    expect(
      agentServerMessageSchema.safeParse({
        interactionId: "33333333-3333-4333-8333-333333333333",
        outcome: "allowed",
        sessionId,
        type: "interaction_resolved",
      }).success,
    ).toBe(true);
  });
});

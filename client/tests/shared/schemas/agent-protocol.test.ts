import { describe, expect, it } from "vitest";
import {
  agentClientMessageSchema,
  agentFileMutationResponseSchema,
  agentFilePathSchema,
  agentRuntimeStatusSchema,
  agentServerMessageSchema,
} from "@/shared/schemas/agent-protocol";

describe("agentFilePathSchema", () => {
  it("accepts clean relative POSIX paths", () => {
    for (const value of [
      "src/App.tsx",
      "package.json",
      "a/b/c/d.ts",
      "index.ts",
    ]) {
      expect(agentFilePathSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects traversal, absolute, backslash, empty, and forbidden paths", () => {
    for (const value of [
      "../x",
      "src/../../etc",
      "/abs",
      "a\\b",
      "a//b",
      "a/",
      "",
      "./a",
      "a/./b",
      ".git",
      "a/.git/config",
      "node_modules/pkg/index.js",
      "a\u0000b",
    ]) {
      expect(agentFilePathSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("agentRuntimeStatusSchema", () => {
  it("normalizes SCREAMING_SNAKE_CASE and rejects unknown values", () => {
    expect(agentRuntimeStatusSchema.parse("RUNNING")).toBe("running");
    expect(agentRuntimeStatusSchema.parse("WAITING_FOR_PERMISSION")).toBe(
      "waiting_for_permission",
    );
    expect(agentRuntimeStatusSchema.safeParse("dancing").success).toBe(false);
  });
});

describe("agentClientMessageSchema", () => {
  it("accepts the server hello and heartbeat shapes", () => {
    expect(
      agentClientMessageSchema.safeParse({
        type: "hello",
        requestId: "request-1",
        afterSequence: "123",
      }).success,
    ).toBe(true);
    expect(
      agentClientMessageSchema.safeParse({ type: "heartbeat", timestamp: 123 })
        .success,
    ).toBe(true);
  });

  it("rejects stale field names and malformed messages", () => {
    expect(
      agentClientMessageSchema.safeParse({ type: "hello", lastSequence: "1" })
        .success,
    ).toBe(false);
    expect(
      agentClientMessageSchema.safeParse({ type: "heartbeat" }).success,
    ).toBe(false);
    expect(
      agentClientMessageSchema.safeParse({ type: "definitely-not-real" })
        .success,
    ).toBe(false);
  });
});

describe("agentServerMessageSchema", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const turnId = "22222222-2222-4222-8222-222222222222";

  it("accepts a valid recoverable error message", () => {
    expect(
      agentServerMessageSchema.safeParse({
        type: "error",
        code: "interaction_response_failed",
        message: "boom",
        recoverable: true,
      }).success,
    ).toBe(true);
  });

  it("accepts ready with replay, runtime, and pending interaction metadata", () => {
    expect(
      agentServerMessageSchema.safeParse({
        type: "ready",
        sessionId,
        highWatermark: "42",
        readOnly: false,
        permissionMode: "DEFAULT",
        runtimeStatus: "waiting",
        currentTurnId: turnId,
        pendingInteractions: [
          {
            type: "question",
            interactionId: "33333333-3333-4333-8333-333333333333",
            sessionId,
            turnId,
            questions: [
              {
                question: "Continue?",
                header: "Choice",
                options: [{ label: "Yes" }],
                multiSelect: false,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires batch completion metadata and enforces 1000 events", () => {
    const event = (sequence: number) => ({
      sessionId,
      sequence: String(sequence),
      kind: "assistant_message",
      payload: { text: "done" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      agentServerMessageSchema.safeParse({
        type: "transcript_batch",
        sessionId,
        highWatermark: "1",
        complete: true,
        events: [event(1)],
      }).success,
    ).toBe(true);
    expect(
      agentServerMessageSchema.safeParse({
        type: "transcript_batch",
        sessionId,
        highWatermark: "1001",
        complete: false,
        events: Array.from({ length: 1_001 }, (_, index) => event(index + 1)),
      }).success,
    ).toBe(false);
  });

  it("accepts interaction resolution broadcasts", () => {
    expect(
      agentServerMessageSchema.safeParse({
        type: "interaction_resolved",
        interactionId: "33333333-3333-4333-8333-333333333333",
        sessionId,
        outcome: "answered",
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete and unknown server messages", () => {
    expect(agentServerMessageSchema.safeParse({ type: "error" }).success).toBe(
      false,
    );
    expect(agentServerMessageSchema.safeParse({ type: "nope" }).success).toBe(
      false,
    );
  });
});

describe("agentFileMutationResponseSchema", () => {
  it("discriminates successful and conflict mutations", () => {
    expect(
      agentFileMutationResponseSchema.safeParse({
        status: "ok",
        result: { path: "src/x.ts", hash: "abc123" },
      }).success,
    ).toBe(true);
    expect(
      agentFileMutationResponseSchema.safeParse({
        status: "conflict",
        conflict: {
          path: "src/x.ts",
          expectedHash: null,
          actualHash: "def456",
          message: "stale write",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete and unknown mutation envelopes", () => {
    expect(
      agentFileMutationResponseSchema.safeParse({
        status: "ok",
        conflict: { path: "x", expectedHash: null, actualHash: "h" },
      }).success,
    ).toBe(false);
    expect(
      agentFileMutationResponseSchema.safeParse({ status: "maybe" }).success,
    ).toBe(false);
  });
});

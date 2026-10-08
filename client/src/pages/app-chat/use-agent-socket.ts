import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import {
  agentServerMessageSchema,
  type AgentClientMessage,
  type AgentServerMessage,
  type AgentWireTranscriptEvent,
  type AppId,
} from "@/shared/schemas";
import { buildAgentSocketUrl } from "./agent-socket-url";
import {
  type AgentConnectionState,
  type AgentQuestion,
  type AgentTranscriptAction,
  type AgentTranscriptEvent,
  type JsonValue,
} from "./use-agent-transcript";

const reconnectBaseDelayMs = 500;
const reconnectMaximumDelayMs = 15_000;
const heartbeatIntervalMs = 20_000;
const heartbeatAckTimeoutMs = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Normalizes an opaque protocol payload into a JSON-safe value. */
const toJsonValue = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value))
      result[key] = toJsonValue(item);
    return result;
  }
  return null;
};

type WireQuestion = Extract<
  AgentServerMessage,
  { type: "question_request" }
>["questions"][number];

const toTranscriptEvent = (
  event: AgentWireTranscriptEvent,
): AgentTranscriptEvent => ({
  sequence: event.sequence,
  sessionId: event.sessionId,
  turnId: event.turnId,
  kind: event.kind,
  payload: toJsonValue(event.payload),
  createdAt: event.createdAt,
});

const toQuestion = (question: WireQuestion): AgentQuestion => ({
  question: question.question,
  header: question.header,
  options: question.options.map((option) => ({
    label: option.label,
    description: option.description,
  })),
  multiSelect: question.multiSelect,
});

// ---------------------------------------------------------------------------
// Client -> server messages.
// ---------------------------------------------------------------------------

export type AgentSelectedElement = Record<string, unknown>;

export type AgentRunOptions = {
  readonly selectedElement?: AgentSelectedElement;
  readonly previewError?: string;
  readonly clientFileRevision?: string;
};

export type PermissionDecision = "allow" | "deny" | "allowAlways";
export type QuestionAnswers = Record<string, string | string[]>;

const newRequestId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${String(Date.now())}-${String(Math.round(Math.random() * 1e9))}`;

export type UseAgentSocketOptions = {
  readonly appId: AppId | undefined;
  readonly enabled?: boolean;
  readonly sessionId: string | undefined;
  readonly lastSequence: string;
  readonly dispatch: Dispatch<AgentTranscriptAction>;
};

export type UseAgentSocketResult = {
  readonly connectionState: AgentConnectionState;
  readonly connect: () => void;
  readonly disconnect: () => void;
  readonly run: (input: string, options?: AgentRunOptions) => boolean;
  readonly abort: (turnId?: string) => boolean;
  readonly respondPermission: (
    interactionId: string,
    decision: PermissionDecision,
  ) => boolean;
  readonly respondQuestion: (
    interactionId: string,
    answers: QuestionAnswers,
  ) => boolean;
};

export function useAgentSocket({
  appId,
  enabled = true,
  sessionId,
  lastSequence,
  dispatch,
}: UseAgentSocketOptions): UseAgentSocketResult {
  const [connectionState, setConnectionState] =
    useState<AgentConnectionState>("idle");
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reconnectAttemptRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const lastSequenceRef = useRef(lastSequence);
  const connectRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    lastSequenceRef.current = lastSequence;
  }, [lastSequence, sessionId]);

  const transition = useCallback(
    (next: AgentConnectionState): void => {
      if (!mountedRef.current) return;
      setConnectionState(next);
      dispatch({ type: "connection_changed", state: next });
    },
    [dispatch],
  );

  const clearHeartbeat = useCallback((): void => {
    if (heartbeatTimerRef.current !== undefined) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
    if (heartbeatTimeoutRef.current !== undefined) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  const clearReconnect = useCallback((): void => {
    if (reconnectTimerRef.current === undefined) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = undefined;
  }, []);

  const sendNow = useCallback((message: AgentClientMessage): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const handleMessage = useCallback(
    (message: AgentServerMessage): void => {
      switch (message.type) {
        case "ready": {
          const afterSequence =
            sessionIdRef.current === message.sessionId
              ? lastSequenceRef.current
              : "0";
          const permission = message.pendingInteractions.find(
            (interaction) => interaction.type === "permission",
          );
          const question = message.pendingInteractions.find(
            (interaction) => interaction.type === "question",
          );
          reconnectAttemptRef.current = 0;
          transition("connected");
          dispatch({
            type: "ready",
            currentTurnId: message.currentTurnId ?? undefined,
            highWatermark: message.highWatermark,
            pendingPermission:
              permission?.type === "permission"
                ? {
                    args: toJsonValue(permission.request.args ?? null),
                    description: permission.request.description,
                    interactionId: permission.interactionId,
                    reason: permission.request.reason,
                    toolName: permission.request.toolName,
                    turnId: permission.turnId,
                  }
                : undefined,
            pendingQuestion:
              question?.type === "question"
                ? {
                    interactionId: question.interactionId,
                    questions: question.questions.map(toQuestion),
                    turnId: question.turnId,
                  }
                : undefined,
            permissionMode: message.permissionMode,
            readOnly: message.readOnly,
            runtimeStatus: message.runtimeStatus,
            sessionId: message.sessionId,
          });
          sessionIdRef.current = message.sessionId;
          if (afterSequence === "0") lastSequenceRef.current = "0";
          sendNow({
            afterSequence,
            requestId: newRequestId(),
            type: "hello",
          });
          return;
        }
        case "candidates":
          dispatch({
            type: "candidates",
            candidates: message.candidates.map((candidate) => ({
              name: candidate.name,
              description: candidate.description,
              aliases: candidate.aliases,
              type: candidate.type,
            })),
          });
          return;
        case "transcript_batch":
          dispatch({
            type: "transcript_batch",
            complete: message.complete,
            events: message.events.map(toTranscriptEvent),
            highWatermark: message.highWatermark,
            sessionId: message.sessionId,
          });
          return;
        case "event":
          dispatch({ type: "event", event: toTranscriptEvent(message.event) });
          return;
        case "assistant_delta":
          if (
            isRecord(message.payload) &&
            typeof message.payload.text === "string"
          ) {
            dispatch({ type: "assistant_delta", text: message.payload.text });
          }
          return;
        case "agent_status":
          if (
            isRecord(message.payload) &&
            message.payload.phase === "thinking" &&
            typeof message.payload.text === "string"
          ) {
            dispatch({ type: "thinking_delta", text: message.payload.text });
          }
          return;
        case "runtime_status":
          dispatch({
            type: "runtime_status",
            status: message.status,
            turnId: message.turnId,
            detail: message.detail,
          });
          return;
        case "permission_request":
          dispatch({
            type: "permission_request",
            request: {
              interactionId: message.interactionId,
              turnId: message.turnId,
              toolName: message.request.toolName,
              args: toJsonValue(message.request.args ?? null),
              description: message.request.description,
              reason: message.request.reason,
            },
            sessionId: message.sessionId,
          });
          return;
        case "question_request":
          dispatch({
            type: "question_request",
            request: {
              interactionId: message.interactionId,
              turnId: message.turnId,
              questions: message.questions.map(toQuestion),
            },
            sessionId: message.sessionId,
          });
          return;
        case "interaction_resolved":
          dispatch({
            type: "interaction_resolved",
            interactionId: message.interactionId,
            sessionId: message.sessionId,
          });
          return;
        case "command_result":
          dispatch({
            type: "command_result",
            result: {
              command: message.command,
              requestId: message.requestId,
              supported: message.supported,
              result:
                message.result === undefined
                  ? undefined
                  : toJsonValue(message.result),
              error: message.error,
            },
          });
          return;
        case "files_changed":
          dispatch({ type: "files_changed", revision: message.revision });
          return;
        case "error":
          dispatch({
            type: "error",
            message: message.message,
            code: message.code,
          });
          return;
        case "heartbeat_ack":
          if (heartbeatTimeoutRef.current !== undefined) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = undefined;
          }
          return;
      }
    },
    [dispatch, sendNow, transition],
  );

  const startHeartbeat = useCallback(
    (socket: WebSocket, generation: number): void => {
      clearHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (
          generationRef.current !== generation ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        if (heartbeatTimeoutRef.current !== undefined) {
          socket.close(4000, "heartbeat timeout");
          return;
        }
        socket.send(
          JSON.stringify({
            type: "heartbeat",
            requestId: newRequestId(),
            timestamp: Date.now(),
          }),
        );
        heartbeatTimeoutRef.current = setTimeout(() => {
          heartbeatTimeoutRef.current = undefined;
          if (
            generationRef.current === generation &&
            socket.readyState === WebSocket.OPEN
          ) {
            socket.close(4000, "heartbeat timeout");
          }
        }, heartbeatAckTimeoutMs);
      }, heartbeatIntervalMs);
    },
    [clearHeartbeat],
  );

  const scheduleReconnect = useCallback((): void => {
    if (
      !mountedRef.current ||
      manualDisconnectRef.current ||
      !enabled ||
      appId === undefined ||
      reconnectTimerRef.current !== undefined
    ) {
      return;
    }
    transition("reconnecting");
    const attempt = reconnectAttemptRef.current;
    reconnectAttemptRef.current += 1;
    const delay = Math.min(
      reconnectMaximumDelayMs,
      reconnectBaseDelayMs * 2 ** attempt,
    );
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = undefined;
      connectRef.current();
    }, delay);
  }, [appId, enabled, transition]);

  const connect = useCallback((): void => {
    if (!mountedRef.current || !enabled || appId === undefined) return;
    const current = socketRef.current;
    if (
      current?.readyState === WebSocket.OPEN ||
      current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    clearReconnect();
    clearHeartbeat();
    manualDisconnectRef.current = false;
    transition(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let socket: WebSocket;
    try {
      socket = new WebSocket(buildAgentSocketUrl(appId));
    } catch (cause) {
      dispatch({
        type: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "Unable to open the agent socket",
        code: "socket_create_failed",
      });
      scheduleReconnect();
      return;
    }
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      if (generationRef.current !== generation) return;
      transition("handshaking");
      startHeartbeat(socket, generation);
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (generationRef.current !== generation) return;
      if (typeof event.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const result = agentServerMessageSchema.safeParse(parsed);
      if (result.success) handleMessage(result.data);
    });
    socket.addEventListener("error", () => {
      if (generationRef.current !== generation) return;
      dispatch({
        type: "error",
        message: "Agent socket connection failed",
        code: "socket_error",
      });
    });
    socket.addEventListener("close", () => {
      if (generationRef.current !== generation) return;
      socketRef.current = undefined;
      clearHeartbeat();
      if (manualDisconnectRef.current || !mountedRef.current) {
        transition("disconnected");
        return;
      }
      scheduleReconnect();
    });
  }, [
    appId,
    clearHeartbeat,
    clearReconnect,
    dispatch,
    enabled,
    handleMessage,
    scheduleReconnect,
    startHeartbeat,
    transition,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback((): void => {
    manualDisconnectRef.current = true;
    clearReconnect();
    clearHeartbeat();
    generationRef.current += 1;
    const socket = socketRef.current;
    socketRef.current = undefined;
    if (
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      socket.close(1000, "client disconnected");
    }
    transition("disconnected");
  }, [clearHeartbeat, clearReconnect, transition]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled && appId !== undefined) connectRef.current();
    return () => {
      mountedRef.current = false;
      manualDisconnectRef.current = true;
      clearReconnect();
      clearHeartbeat();
      generationRef.current += 1;
      const socket = socketRef.current;
      socketRef.current = undefined;
      if (
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      ) {
        socket.close(1000, "component unmounted");
      }
    };
  }, [appId, clearHeartbeat, clearReconnect, enabled]);

  const run = useCallback(
    (input: string, options: AgentRunOptions = {}): boolean => {
      const trimmed = input.trim();
      if (trimmed.length === 0) return false;
      return sendNow({
        type: "run",
        requestId: newRequestId(),
        input: trimmed,
        ...(options.selectedElement !== undefined && {
          selectedElement: options.selectedElement,
        }),
        ...(options.previewError !== undefined && {
          previewError: options.previewError,
        }),
        ...(options.clientFileRevision !== undefined && {
          clientFileRevision: options.clientFileRevision,
        }),
      });
    },
    [sendNow],
  );

  const abort = useCallback(
    (turnId?: string): boolean =>
      sendNow({
        type: "abort",
        requestId: newRequestId(),
        ...(turnId !== undefined && { turnId }),
      }),
    [sendNow],
  );

  const respondPermission = useCallback(
    (interactionId: string, decision: PermissionDecision): boolean =>
      sendNow({
        type: "permission_response",
        requestId: newRequestId(),
        interactionId,
        decision: decision === "deny" ? "deny" : "allow",
        ...(decision === "allowAlways" && { remember: true }),
      }),
    [sendNow],
  );

  const respondQuestion = useCallback(
    (interactionId: string, answers: QuestionAnswers): boolean =>
      sendNow({
        type: "question_response",
        requestId: newRequestId(),
        interactionId,
        answers,
      }),
    [sendNow],
  );

  return {
    connectionState,
    connect,
    disconnect,
    run,
    abort,
    respondPermission,
    respondQuestion,
  };
}

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
  type AgentBackgroundTaskInfo,
  type AgentConnectionState,
  type AgentQuestion,
  type AgentSubagentInfo,
  type AgentTeammateInfo,
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

const isString = (value: unknown): value is string => typeof value === "string";

const SUBAGENT_STATUSES: readonly string[] = [
  "running",
  "completed",
  "failed",
  "stopped",
];

const isSubagentStatus = (
  value: unknown,
): value is AgentSubagentInfo["status"] =>
  isString(value) && SUBAGENT_STATUSES.includes(value);

const toSubagentInfo = (value: unknown): AgentSubagentInfo[] => {
  if (
    !isRecord(value) ||
    !isString(value.toolCallId) ||
    !isString(value.role)
  ) {
    return [];
  }
  const status = isSubagentStatus(value.status) ? value.status : "running";
  const activeTools = Array.isArray(value.activeTools)
    ? value.activeTools.flatMap((tool) =>
        isRecord(tool) && isString(tool.toolId) && isString(tool.toolName)
          ? [{ toolId: tool.toolId, toolName: tool.toolName }]
          : [],
      )
    : [];
  return [
    {
      activeTools,
      background: value.background === true,
      role: value.role,
      status,
      toolCallId: value.toolCallId,
      turnCount: typeof value.turnCount === "number" ? value.turnCount : 0,
    },
  ];
};

const toTaskInfo = (value: unknown): AgentBackgroundTaskInfo[] => {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) {
    return [];
  }
  return [
    {
      id: value.id,
      kind: isString(value.kind) ? value.kind : "agent",
      name: value.name,
      status: isString(value.status) ? value.status : "unknown",
    },
  ];
};

const toTeammateInfo = (value: unknown): AgentTeammateInfo[] => {
  if (!isRecord(value) || !isString(value.name) || !isString(value.teamName)) {
    return [];
  }
  const progress = isRecord(value.progress) ? value.progress : {};
  const number = (candidate: unknown): number =>
    typeof candidate === "number" ? candidate : 0;
  return [
    {
      lastMessage: isString(value.lastMessage) ? value.lastMessage : null,
      name: value.name,
      spinnerVerb: isString(value.spinnerVerb) ? value.spinnerVerb : "",
      status: isString(value.status) ? value.status : "unknown",
      teamName: value.teamName,
      tokenCount: number(progress.tokenCount ?? value.tokenCount),
      toolUseCount: number(progress.toolUseCount ?? value.toolUseCount),
      turnCount: number(progress.turnCount ?? value.turnCount),
    },
  ];
};

const toQuestion = (question: WireQuestion): AgentQuestion => ({
  question: question.question,
  options: question.options.map((option) => ({
    label: option.label,
    description: option.description,
  })),
  multiSelect: question.multiSelect,
});

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
  readonly respondPlanApproval: (
    choice: "yolo" | "manual" | "feedback",
    feedback?: string,
  ) => boolean;
  readonly rewind: (
    sha: string,
    action: "code_and_conversation" | "conversation_only" | "code_only",
  ) => boolean;
  readonly requestFileCompletions: (
    requestId: string,
    query: string,
  ) => boolean;
  readonly uploadImage: (
    clientId: string,
    name: string,
    dataBase64: string,
  ) => boolean;
  readonly backgroundShells: () => boolean;
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
            ...(message.model !== undefined && { model: message.model }),
            ...(message.thinkingLevel !== undefined && {
              thinkingLevel: message.thinkingLevel,
            }),
            ...(message.contextTokens !== undefined && {
              contextTokens: message.contextTokens,
            }),
            ...(message.contextWindow !== undefined && {
              contextWindow: message.contextWindow,
            }),
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
          if (isRecord(message.payload)) {
            if (
              message.payload.phase === "thinking" &&
              typeof message.payload.text === "string"
            ) {
              dispatch({ type: "thinking_delta", text: message.payload.text });
            } else if (
              message.payload.phase === "steering_queued" &&
              typeof message.payload.text === "string"
            ) {
              dispatch({ type: "steering_queued", text: message.payload.text });
            } else if (
              message.payload.phase === "steering_delivered" &&
              typeof message.payload.text === "string"
            ) {
              dispatch({
                type: "steering_delivered",
                text: message.payload.text,
              });
            } else if (
              message.payload.phase === "followup_queued" &&
              typeof message.payload.text === "string"
            ) {
              dispatch({ type: "followup_queued", text: message.payload.text });
            } else if (
              message.payload.phase === "followup_started" &&
              typeof message.payload.text === "string"
            ) {
              dispatch({
                type: "followup_started",
                text: message.payload.text,
              });
            } else if (
              message.payload.phase === "permission" &&
              typeof message.payload.toolName === "string"
            ) {
              dispatch({
                type: "runtime_status",
                status: "waiting",
                turnId: undefined,
                detail: `Permission: ${message.payload.toolName}`,
              });
            }
          }
          return;
        case "plan_approval_request":
          dispatch({
            type: "plan_approval_request",
            request: {
              planContent: message.planContent,
              planPath: message.planPath,
            },
          });
          return;
        case "model_list":
          dispatch({
            type: "model_list",
            list: {
              current: message.current,
              models: message.models,
              status: message.status,
            },
          });
          return;
        case "thinking_form":
          dispatch({
            type: "thinking_form",
            form: { current: message.current, levels: message.levels },
          });
          return;
        case "rewind_list":
          dispatch({ type: "rewind_list", snapshots: message.snapshots });
          return;
        case "file_complete_response":
          dispatch({
            type: "file_complete_response",
            matches: message.matches,
            requestId: message.requestId,
          });
          return;
        case "image_saved":
          dispatch({
            type: "image_saved",
            clientId: message.clientId,
            path: message.path,
          });
          return;
        case "image_error":
          dispatch({
            type: "image_error",
            clientId: message.clientId,
            message: message.message,
          });
          return;
        case "history":
          dispatch({ type: "history", entries: message.entries });
          return;
        case "usage":
          // The legacy structured-event union also declares a "usage" member
          // with an opaque payload; only the literal usage frame carries the
          // token counters.
          if (!("inputTokens" in message)) return;
          dispatch({
            type: "usage",
            usage: {
              contextTokens: message.contextTokens,
              contextWindow: message.contextWindow,
              inputTokens: message.inputTokens,
              outputTokens: message.outputTokens,
            },
          });
          return;
        case "tool_output":
          dispatch({
            type: "runtime_status",
            status: "running",
            turnId: undefined,
            detail: message.output.slice(-160),
          });
          return;
        case "permission_mode":
          dispatch({ type: "permission_mode", permissionMode: message.mode });
          return;
        case "session_replaced":
          // Conversation rewind: drop the local transcript and re-sync from 0.
          lastSequenceRef.current = "0";
          dispatch({ type: "session_replaced" });
          sendNow({
            afterSequence: "0",
            requestId: newRequestId(),
            type: "hello",
          });
          return;
        case "subagent":
        case "team":
        case "task": {
          const payload = message.payload;
          if (!isRecord(payload) || !Array.isArray(payload.list)) return;
          if (message.type === "subagent") {
            dispatch({
              type: "activity_subagents",
              list: payload.list.flatMap(toSubagentInfo),
            });
          } else if (message.type === "task") {
            dispatch({
              type: "activity_tasks",
              list: payload.list.flatMap(toTaskInfo),
            });
          } else {
            dispatch({
              type: "activity_teammates",
              list: payload.list.flatMap(toTeammateInfo),
            });
          }
          return;
        }
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

  const respondPlanApproval = useCallback(
    (choice: "yolo" | "manual" | "feedback", feedback?: string): boolean =>
      sendNow({
        type: "plan_approval_response",
        requestId: newRequestId(),
        choice,
        ...(feedback !== undefined && { feedback }),
      }),
    [sendNow],
  );

  const rewind = useCallback(
    (
      sha: string,
      action: "code_and_conversation" | "conversation_only" | "code_only",
    ): boolean =>
      sendNow({
        type: "rewind_action",
        requestId: newRequestId(),
        sha,
        action,
      }),
    [sendNow],
  );

  const requestFileCompletions = useCallback(
    (requestId: string, query: string): boolean =>
      sendNow({ type: "file_complete_request", requestId, query }),
    [sendNow],
  );

  const uploadImage = useCallback(
    (clientId: string, name: string, dataBase64: string): boolean =>
      sendNow({ type: "image_upload", clientId, name, dataBase64 }),
    [sendNow],
  );

  const backgroundShells = useCallback(
    (): boolean =>
      sendNow({ type: "background_shells", requestId: newRequestId() }),
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
    respondPlanApproval,
    rewind,
    requestFileCompletions,
    uploadImage,
    backgroundShells,
  };
}

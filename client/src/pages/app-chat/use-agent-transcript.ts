import { useReducer, type Dispatch } from "react";

/**
 * Client-side transcript model for the bidirectional Agent workspace. It mirrors
 * the server WebSocket protocol in `server/src/agent-runtime/protocol.ts`:
 * persisted events arrive wrapped in `event` / `transcript_batch`, while live
 * token streaming (`assistant_delta`) and thinking (`agent_status`) are ephemeral
 * and are superseded by the persisted `assistant_message` / `thinking` events at
 * turn end.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AgentConnectionState =
  | "idle"
  | "connecting"
  | "handshaking"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type AgentRuntimeStatus =
  "idle" | "running" | "waiting" | "stopped" | "error";

export type AgentCommandCandidate = {
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly type: string;
};

export type AgentTranscriptEvent = {
  readonly sequence: string;
  readonly sessionId: string;
  readonly turnId: string | undefined;
  readonly kind: string;
  readonly payload: JsonValue;
  readonly createdAt: string;
};

export type AgentPermissionRequest = {
  readonly interactionId: string;
  readonly turnId: string | undefined;
  readonly toolName: string;
  readonly args: JsonValue;
  readonly description: string | undefined;
  readonly reason: string | undefined;
};

export type AgentQuestionOption = {
  readonly label: string;
  readonly description: string | undefined;
};

export type AgentQuestion = {
  readonly question: string;
  readonly header: string;
  readonly options: readonly AgentQuestionOption[];
  readonly multiSelect: boolean;
};

export type AgentQuestionRequest = {
  readonly interactionId: string;
  readonly turnId: string | undefined;
  readonly questions: readonly AgentQuestion[];
};

export type AgentCommandResult = {
  readonly id: number;
  readonly command: string;
  readonly requestId: string | undefined;
  readonly supported: boolean;
  readonly result: JsonValue | undefined;
  readonly error: string | undefined;
};

export type AgentError = {
  readonly id: number;
  readonly message: string;
  readonly code: string | undefined;
};

export type AgentTranscriptState = {
  readonly connectionState: AgentConnectionState;
  readonly runtimeStatus: AgentRuntimeStatus;
  readonly currentTurnId: string | undefined;
  readonly sessionId: string | undefined;
  readonly permissionMode: string | undefined;
  readonly readOnly: boolean;
  /** Highest contiguous event actually applied for the current session. */
  readonly lastSequence: string;
  /** Fixed server target for the current replay cycle. */
  readonly replayHighWatermark: string;
  readonly replayComplete: boolean;
  readonly replaying: boolean;
  readonly pendingEvents: ReadonlyArray<AgentTranscriptEvent>;
  readonly events: ReadonlyArray<AgentTranscriptEvent>;
  readonly streamingText: string;
  readonly thinkingText: string;
  readonly statusDetail: string | undefined;
  readonly candidates: ReadonlyArray<AgentCommandCandidate>;
  readonly pendingPermission: AgentPermissionRequest | undefined;
  readonly pendingQuestion: AgentQuestionRequest | undefined;
  readonly commandResults: ReadonlyArray<AgentCommandResult>;
  readonly errors: ReadonlyArray<AgentError>;
  readonly filesRevision: number;
  readonly latestFileRevision: string | undefined;
};

export type AgentTranscriptAction =
  | {
      readonly type: "connection_changed";
      readonly state: AgentConnectionState;
    }
  | {
      readonly type: "ready";
      readonly sessionId: string;
      readonly readOnly: boolean;
      readonly permissionMode: string;
      readonly highWatermark: string;
      readonly runtimeStatus: AgentRuntimeStatus;
      readonly currentTurnId: string | undefined;
      readonly pendingPermission: AgentPermissionRequest | undefined;
      readonly pendingQuestion: AgentQuestionRequest | undefined;
    }
  | {
      readonly type: "candidates";
      readonly candidates: ReadonlyArray<AgentCommandCandidate>;
    }
  | {
      readonly type: "transcript_batch";
      readonly sessionId: string;
      readonly highWatermark: string;
      readonly complete: boolean;
      readonly events: ReadonlyArray<AgentTranscriptEvent>;
    }
  | { readonly type: "event"; readonly event: AgentTranscriptEvent }
  | { readonly type: "assistant_delta"; readonly text: string }
  | { readonly type: "thinking_delta"; readonly text: string }
  | {
      readonly type: "runtime_status";
      readonly status: AgentRuntimeStatus;
      readonly turnId: string | undefined;
      readonly detail: string | undefined;
    }
  | { readonly type: "permission_mode"; readonly permissionMode: string }
  | {
      readonly type: "permission_request";
      readonly sessionId: string;
      readonly request: AgentPermissionRequest;
    }
  | {
      readonly type: "question_request";
      readonly sessionId: string;
      readonly request: AgentQuestionRequest;
    }
  | {
      readonly type: "interaction_resolved";
      readonly sessionId: string;
      readonly interactionId: string;
    }
  | {
      readonly type: "command_result";
      readonly result: Omit<AgentCommandResult, "id">;
    }
  | { readonly type: "files_changed"; readonly revision: string | undefined }
  | {
      readonly type: "error";
      readonly message: string;
      readonly code: string | undefined;
    }
  | { readonly type: "dismiss_error"; readonly id: number }
  | { readonly type: "reset" };

export const initialAgentTranscriptState: AgentTranscriptState = {
  connectionState: "idle",
  runtimeStatus: "idle",
  currentTurnId: undefined,
  sessionId: undefined,
  permissionMode: undefined,
  readOnly: false,
  lastSequence: "0",
  replayHighWatermark: "0",
  replayComplete: true,
  replaying: false,
  pendingEvents: [],
  events: [],
  streamingText: "",
  thinkingText: "",
  statusDetail: undefined,
  candidates: [],
  pendingPermission: undefined,
  pendingQuestion: undefined,
  commandResults: [],
  errors: [],
  filesRevision: 0,
  latestFileRevision: undefined,
};

const MAX_COMMAND_RESULTS = 50;
const MAX_ERRORS = 20;
let sideItemId = 0;

/** Numeric comparison of decimal sequence strings (arbitrary length safe). */
export function compareAgentSequences(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

const eventKey = (event: AgentTranscriptEvent): string =>
  `${event.sessionId}:${event.sequence}`;

function mergeEvents(
  current: ReadonlyArray<AgentTranscriptEvent>,
  incoming: ReadonlyArray<AgentTranscriptEvent>,
): AgentTranscriptEvent[] {
  const bySessionSequence = new Map<string, AgentTranscriptEvent>();
  for (const event of current) bySessionSequence.set(eventKey(event), event);
  for (const event of incoming) bySessionSequence.set(eventKey(event), event);
  return [...bySessionSequence.values()].sort((left, right) =>
    compareAgentSequences(left.sequence, right.sequence),
  );
}

// Persisted events that mark the boundary between live streaming and the
// authoritative transcript. Once these arrive the ephemeral buffers are cleared.
const TURN_BOUNDARY_KINDS = new Set([
  "user_message",
  "assistant_message",
  "loop_complete",
  "turn_complete",
]);

function applyEvents(
  state: AgentTranscriptState,
  incoming: ReadonlyArray<AgentTranscriptEvent>,
  replay: Readonly<{
    complete?: boolean;
    highWatermark?: string;
  }> = {},
): AgentTranscriptState {
  if (state.sessionId === undefined) return state;

  const pendingBySequence = new Map<string, AgentTranscriptEvent>();
  for (const event of [...state.pendingEvents, ...incoming]) {
    if (
      event.sessionId === state.sessionId &&
      compareAgentSequences(event.sequence, state.lastSequence) > 0
    ) {
      pendingBySequence.set(event.sequence, event);
    }
  }

  const applied: AgentTranscriptEvent[] = [];
  let lastSequence = state.lastSequence;
  while (true) {
    const expected = (BigInt(lastSequence) + 1n).toString();
    const next = pendingBySequence.get(expected);
    if (next === undefined) break;
    pendingBySequence.delete(expected);
    applied.push(next);
    lastSequence = expected;
  }

  const replayHighWatermark = replay.highWatermark ?? state.replayHighWatermark;
  const replayComplete = replay.complete ?? state.replayComplete;
  const clearsBuffers = applied.some((event) =>
    TURN_BOUNDARY_KINDS.has(event.kind),
  );
  return {
    ...state,
    events: mergeEvents(state.events, applied),
    lastSequence,
    pendingEvents: [...pendingBySequence.values()].sort((left, right) =>
      compareAgentSequences(left.sequence, right.sequence),
    ),
    replayComplete,
    replayHighWatermark,
    replaying:
      !replayComplete ||
      compareAgentSequences(lastSequence, replayHighWatermark) < 0,
    ...(clearsBuffers && { streamingText: "", thinkingText: "" }),
  };
}

export function agentTranscriptReducer(
  state: AgentTranscriptState,
  action: AgentTranscriptAction,
): AgentTranscriptState {
  switch (action.type) {
    case "connection_changed":
      return { ...state, connectionState: action.state };
    case "ready": {
      const sessionChanged =
        state.sessionId !== undefined && state.sessionId !== action.sessionId;
      const base = sessionChanged
        ? {
            ...initialAgentTranscriptState,
            candidates: state.candidates,
            connectionState: state.connectionState,
          }
        : state;
      return {
        ...base,
        currentTurnId: action.currentTurnId,
        pendingEvents: sessionChanged ? [] : base.pendingEvents,
        pendingPermission: action.pendingPermission,
        pendingQuestion: action.pendingQuestion,
        permissionMode: action.permissionMode,
        readOnly: action.readOnly,
        replayComplete: false,
        replayHighWatermark: action.highWatermark,
        replaying: true,
        runtimeStatus: action.runtimeStatus,
        sessionId: action.sessionId,
      };
    }
    case "candidates":
      return { ...state, candidates: action.candidates };
    case "transcript_batch":
      if (state.sessionId !== action.sessionId) return state;
      return applyEvents(state, action.events, {
        complete: action.complete,
        highWatermark: action.highWatermark,
      });
    case "event":
      return applyEvents(state, [action.event]);
    case "assistant_delta":
      return { ...state, streamingText: state.streamingText + action.text };
    case "thinking_delta":
      return { ...state, thinkingText: state.thinkingText + action.text };
    case "runtime_status":
      return {
        ...state,
        currentTurnId:
          action.status === "idle" ||
          action.status === "stopped" ||
          action.status === "error"
            ? undefined
            : (action.turnId ?? state.currentTurnId),
        runtimeStatus: action.status,
        statusDetail: action.detail,
        // Reaching a terminal status drops any half-streamed buffers.
        ...(action.status === "idle" && { thinkingText: "" }),
      };
    case "permission_mode":
      return { ...state, permissionMode: action.permissionMode };
    case "permission_request":
      return state.sessionId === action.sessionId
        ? { ...state, pendingPermission: action.request }
        : state;
    case "question_request":
      return state.sessionId === action.sessionId
        ? { ...state, pendingQuestion: action.request }
        : state;
    case "interaction_resolved": {
      if (state.sessionId !== action.sessionId) return state;
      const clearedPermission =
        state.pendingPermission?.interactionId === action.interactionId;
      const clearedQuestion =
        state.pendingQuestion?.interactionId === action.interactionId;
      if (!clearedPermission && !clearedQuestion) return state;
      return {
        ...state,
        ...(clearedPermission && { pendingPermission: undefined }),
        ...(clearedQuestion && { pendingQuestion: undefined }),
      };
    }
    case "command_result":
      return {
        ...state,
        commandResults: [
          ...state.commandResults.slice(-(MAX_COMMAND_RESULTS - 1)),
          { ...action.result, id: (sideItemId += 1) },
        ],
      };
    case "files_changed":
      return {
        ...state,
        filesRevision: state.filesRevision + 1,
        latestFileRevision: action.revision ?? state.latestFileRevision,
      };
    case "error":
      return {
        ...state,
        errors: [
          ...state.errors.slice(-(MAX_ERRORS - 1)),
          { id: (sideItemId += 1), message: action.message, code: action.code },
        ],
      };
    case "dismiss_error":
      return {
        ...state,
        errors: state.errors.filter((error) => error.id !== action.id),
      };
    case "reset":
      return {
        ...initialAgentTranscriptState,
        connectionState: state.connectionState,
        candidates: state.candidates,
      };
  }
}

export function isAgentBusy(status: AgentRuntimeStatus): boolean {
  return status === "running" || status === "waiting";
}

export type UseAgentTranscriptResult = {
  readonly state: AgentTranscriptState;
  readonly dispatch: Dispatch<AgentTranscriptAction>;
};

export function useAgentTranscript(): UseAgentTranscriptResult {
  const [state, dispatch] = useReducer(
    agentTranscriptReducer,
    initialAgentTranscriptState,
  );
  return { state, dispatch };
}

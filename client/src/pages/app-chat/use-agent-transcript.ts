import { useReducer, type Dispatch } from "react";

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

export type AgentPlanApproval = {
  readonly planPath: string;
  readonly planContent: string;
};

export type AgentModelList = {
  readonly status: "loading" | "ready" | "empty" | "error";
  readonly models: ReadonlyArray<{
    readonly id: string;
    readonly name: string | null;
  }>;
  readonly current: string;
};

export type AgentThinkingForm = {
  readonly current: string;
  readonly levels: ReadonlyArray<string>;
};

export type AgentRewindSnapshot = {
  readonly sha: string;
  readonly message: string;
  readonly date: string;
  readonly conversation: boolean;
};

export type AgentUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
};

export type AgentSubagentInfo = {
  readonly toolCallId: string;
  readonly role: string;
  readonly background: boolean;
  readonly turnCount: number;
  readonly status: "running" | "completed" | "failed" | "stopped";
  readonly activeTools: ReadonlyArray<{
    readonly toolId: string;
    readonly toolName: string;
  }>;
};

export type AgentBackgroundTaskInfo = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
};

export type AgentTeammateInfo = {
  readonly name: string;
  readonly teamName: string;
  readonly status: string;
  readonly spinnerVerb: string;
  readonly lastMessage: string | null;
  readonly turnCount: number;
  readonly toolUseCount: number;
  readonly tokenCount: number;
};

export type AgentActivity = {
  readonly subagents: ReadonlyArray<AgentSubagentInfo>;
  readonly tasks: ReadonlyArray<AgentBackgroundTaskInfo>;
  readonly teammates: ReadonlyArray<AgentTeammateInfo>;
};

export type AgentImageResult = {
  readonly clientId: string;
  readonly path: string | undefined;
  readonly message: string | undefined;
};

export type AgentTranscriptState = {
  readonly connectionState: AgentConnectionState;
  readonly runtimeStatus: AgentRuntimeStatus;
  readonly currentTurnId: string | undefined;
  readonly sessionId: string | undefined;
  readonly permissionMode: string | undefined;
  readonly readOnly: boolean;
  readonly lastSequence: string;
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
  // Remote-parity interactive surfaces
  readonly planApproval: AgentPlanApproval | undefined;
  readonly modelPicker: AgentModelList | undefined;
  readonly thinkingPicker: AgentThinkingForm | undefined;
  readonly rewindPicker: ReadonlyArray<AgentRewindSnapshot> | undefined;
  readonly history: ReadonlyArray<string>;
  readonly usage: AgentUsage | undefined;
  readonly model: string | undefined;
  readonly thinkingLevel: string | undefined;
  readonly activity: AgentActivity;
  readonly steering: ReadonlyArray<string>;
  readonly followUps: ReadonlyArray<string>;
  readonly fileMatches:
    | { readonly requestId: string; readonly matches: ReadonlyArray<string> }
    | undefined;
  readonly imageResults: ReadonlyArray<AgentImageResult>;
  /** Bumped on session_replaced so the socket re-syncs from sequence 0. */
  readonly resyncCounter: number;
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
      readonly model?: string;
      readonly thinkingLevel?: string;
      readonly contextTokens?: number;
      readonly contextWindow?: number;
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
  | { readonly type: "reset" }
  // Remote-parity interactive surfaces
  | {
      readonly type: "plan_approval_request";
      readonly request: AgentPlanApproval;
    }
  | { readonly type: "close_plan_approval" }
  | { readonly type: "model_list"; readonly list: AgentModelList }
  | { readonly type: "close_model_picker" }
  | { readonly type: "thinking_form"; readonly form: AgentThinkingForm }
  | { readonly type: "close_thinking_picker" }
  | {
      readonly type: "rewind_list";
      readonly snapshots: ReadonlyArray<AgentRewindSnapshot>;
    }
  | { readonly type: "close_rewind_picker" }
  | { readonly type: "history"; readonly entries: ReadonlyArray<string> }
  | { readonly type: "usage"; readonly usage: AgentUsage }
  | {
      readonly type: "activity_subagents";
      readonly list: ReadonlyArray<AgentSubagentInfo>;
    }
  | {
      readonly type: "activity_tasks";
      readonly list: ReadonlyArray<AgentBackgroundTaskInfo>;
    }
  | {
      readonly type: "activity_teammates";
      readonly list: ReadonlyArray<AgentTeammateInfo>;
    }
  | { readonly type: "steering_queued"; readonly text: string }
  | { readonly type: "steering_delivered"; readonly text: string }
  | { readonly type: "followup_queued"; readonly text: string }
  | { readonly type: "followup_started"; readonly text: string }
  | {
      readonly type: "file_complete_response";
      readonly requestId: string;
      readonly matches: ReadonlyArray<string>;
    }
  | {
      readonly type: "image_saved";
      readonly clientId: string;
      readonly path: string;
    }
  | {
      readonly type: "image_error";
      readonly clientId: string;
      readonly message: string;
    }
  | { readonly type: "consume_image_result"; readonly clientId: string }
  | { readonly type: "session_replaced" };

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
  planApproval: undefined,
  modelPicker: undefined,
  thinkingPicker: undefined,
  rewindPicker: undefined,
  history: [],
  usage: undefined,
  model: undefined,
  thinkingLevel: undefined,
  activity: { subagents: [], tasks: [], teammates: [] },
  steering: [],
  followUps: [],
  fileMatches: undefined,
  imageResults: [],
  resyncCounter: 0,
};

const MAX_COMMAND_RESULTS = 50;
const MAX_ERRORS = 20;
let sideItemId = 0;

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
        model: action.model ?? base.model,
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
        thinkingLevel: action.thinkingLevel ?? base.thinkingLevel,
        usage:
          action.contextTokens !== undefined &&
          action.contextWindow !== undefined
            ? {
                contextTokens: action.contextTokens,
                contextWindow: action.contextWindow,
                inputTokens: base.usage?.inputTokens ?? 0,
                outputTokens: base.usage?.outputTokens ?? 0,
              }
            : base.usage,
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
        ...(action.status === "idle" && {
          followUps: [],
          steering: [],
          thinkingText: "",
        }),
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
    case "plan_approval_request":
      return { ...state, planApproval: action.request };
    case "close_plan_approval":
      return { ...state, planApproval: undefined };
    case "model_list":
      return { ...state, modelPicker: action.list };
    case "close_model_picker":
      return { ...state, modelPicker: undefined };
    case "thinking_form":
      return { ...state, thinkingPicker: action.form };
    case "close_thinking_picker":
      return { ...state, thinkingPicker: undefined };
    case "rewind_list":
      return { ...state, rewindPicker: action.snapshots };
    case "close_rewind_picker":
      return { ...state, rewindPicker: undefined };
    case "history":
      return { ...state, history: action.entries };
    case "usage":
      return { ...state, usage: action.usage };
    case "activity_subagents":
      return {
        ...state,
        activity: { ...state.activity, subagents: action.list },
      };
    case "activity_tasks":
      return {
        ...state,
        activity: { ...state.activity, tasks: action.list },
      };
    case "activity_teammates":
      return {
        ...state,
        activity: { ...state.activity, teammates: action.list },
      };
    case "steering_queued":
      return { ...state, steering: [...state.steering, action.text] };
    case "steering_delivered":
      return {
        ...state,
        steering: state.steering.filter((text) => text !== action.text),
      };
    case "followup_queued":
      return { ...state, followUps: [...state.followUps, action.text] };
    case "followup_started": {
      const index = state.followUps.indexOf(action.text);
      if (index === -1) return state;
      return {
        ...state,
        followUps: state.followUps.filter((_, i) => i !== index),
      };
    }
    case "file_complete_response":
      return {
        ...state,
        fileMatches: { matches: action.matches, requestId: action.requestId },
      };
    case "image_saved":
      return {
        ...state,
        imageResults: [
          ...state.imageResults,
          { clientId: action.clientId, message: undefined, path: action.path },
        ],
      };
    case "image_error":
      return {
        ...state,
        imageResults: [
          ...state.imageResults,
          {
            clientId: action.clientId,
            message: action.message,
            path: undefined,
          },
        ],
      };
    case "consume_image_result":
      return {
        ...state,
        imageResults: state.imageResults.filter(
          (result) => result.clientId !== action.clientId,
        ),
      };
    case "session_replaced":
      // The socket hook re-syncs from sequence 0 when resyncCounter changes.
      return {
        ...state,
        events: [],
        lastSequence: "0",
        pendingEvents: [],
        replayComplete: false,
        replayHighWatermark: "0",
        replaying: true,
        resyncCounter: state.resyncCounter + 1,
        streamingText: "",
        thinkingText: "",
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

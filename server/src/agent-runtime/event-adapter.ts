import type { Agent } from "@yukino.js/yukino";
import type { AgentServerMessage } from "./protocol.js";

export type TranscriptKind =
  | "user_message"
  | "assistant_message"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "usage"
  | "compact"
  | "retry"
  | "error"
  | "turn_complete"
  | "loop_complete";

export type AdapterOutput =
  | Readonly<{
      persist: true;
      kind: TranscriptKind;
      payload: Record<string, unknown>;
    }>
  | Readonly<{ persist: false; message: AgentServerMessage }>;

export type TurnOutcome =
  | "pending"
  | "end_turn"
  | "interrupted"
  | "error"
  | "other";

const DETAIL_MAX = 200;
const DETAIL_KEYS = [
  "file_path",
  "path",
  "pattern",
  "command",
  "name",
  "query",
] as const;

const truncate = (value: string): string => {
  const collapsed = value.replaceAll(/\s+/gu, " ").trim();
  return collapsed.length <= DETAIL_MAX
    ? collapsed
    : `${collapsed.slice(0, DETAIL_MAX)}…`;
};

const detailOf = (args: Record<string, unknown>): string | undefined => {
  for (const key of DETAIL_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0)
      return truncate(value);
  }
  return undefined;
};

/**
 * Stateful, per-turn translator from Yukino AgentEvents to transcript events
 * (persisted, sequenced) and ephemeral structured messages (streaming deltas).
 * High-frequency token deltas are emitted ephemerally; the accumulated
 * assistant text is persisted once as an `assistant_message` at turn end.
 */
export const createEventAdapter = () => {
  const narrationParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let outcome: TurnOutcome = "pending";
  let errorMessage: string | undefined;

  const mapEvent = (event: Agent.Events.AgentEvent): AdapterOutput[] => {
    switch (event.type) {
      case "stream_text": {
        narrationParts.push(event.text);
        return [
          {
            message: { payload: { text: event.text }, type: "assistant_delta" },
            persist: false,
          },
        ];
      }
      case "thinking_text":
        return [
          {
            message: {
              payload: { phase: "thinking", text: event.text },
              type: "agent_status",
            },
            persist: false,
          },
        ];
      case "thinking_complete":
        return [
          {
            kind: "thinking",
            payload: { thinking: event.thinking },
            persist: true,
          },
        ];
      case "tool_use": {
        const detail = detailOf(event.args);
        return [
          {
            kind: "tool_use",
            payload: {
              args: event.args,
              toolId: event.toolId,
              toolName: event.toolName,
              ...(detail !== undefined && { detail }),
            },
            persist: true,
          },
        ];
      }
      case "tool_result": {
        // Since 0.0.37 the library emits `output` already flattened to text
        // (structured blocks ride along in the optional `contentBlocks`).
        const text = event.output;
        return [
          {
            kind: "tool_result",
            payload: {
              elapsed: event.elapsed,
              isError: event.isError,
              output: truncate(text),
              toolId: event.toolId,
              toolName: event.toolName,
            },
            persist: true,
          },
        ];
      }
      case "usage": {
        inputTokens += event.usage.inputTokens;
        outputTokens += event.usage.outputTokens;
        return [
          {
            kind: "usage",
            payload: {
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
            },
            persist: true,
          },
        ];
      }
      case "compact":
        return [
          {
            kind: "compact",
            payload: { message: event.message },
            persist: true,
          },
        ];
      case "retry":
        return [
          {
            kind: "retry",
            payload: { delay: event.delay, reason: event.reason },
            persist: true,
          },
        ];
      case "error": {
        outcome = "error";
        errorMessage = truncate(event.error.message);
        return [
          { kind: "error", payload: { message: errorMessage }, persist: true },
        ];
      }
      case "turn_complete":
        return [{ kind: "turn_complete", payload: {}, persist: true }];
      case "loop_complete": {
        if (event.stopReason === "end_turn") outcome = "end_turn";
        else if (event.stopReason === "interrupted") outcome = "interrupted";
        else {
          outcome = "other";
          errorMessage = `Generation stopped: ${event.stopReason}`;
        }
        return [
          {
            kind: "loop_complete",
            payload: { stopReason: event.stopReason },
            persist: true,
          },
        ];
      }
      case "permission_request":
        return [
          {
            message: {
              payload: { phase: "permission", toolName: event.toolName },
              type: "agent_status",
            },
            persist: false,
          },
        ];
      default:
        return [];
    }
  };

  return {
    errorMessage: (): string | undefined => errorMessage,
    mapEvent,
    narration: (): string => narrationParts.join("").trim(),
    outcome: (): TurnOutcome => outcome,
    usage: (): Readonly<{ input: number; output: number }> => ({
      input: inputTokens,
      output: outputTokens,
    }),
  };
};

export type EventAdapter = ReturnType<typeof createEventAdapter>;

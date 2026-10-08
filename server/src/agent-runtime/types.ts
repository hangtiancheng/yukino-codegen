import type { AgentServerMessage } from "./protocol.js";

/** A single WebSocket subscriber attached to a workspace runtime. */
export type AgentConnection = Readonly<{
  id: string;
  userId: bigint;
  readOnly: boolean;
  send: (message: AgentServerMessage) => void;
  close: (code?: number, reason?: string) => void;
}>;

export type PermissionDecision = "allow" | "deny" | "allowAlways";

export type QuestionAnswers = Record<string, string | string[]>;

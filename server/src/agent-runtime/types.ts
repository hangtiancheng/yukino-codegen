import type { AgentServerMessage } from "./protocol.js";

export type AgentConnection = Readonly<{
  id: string;
  userId: bigint;
  readOnly: boolean;
  send: (message: AgentServerMessage) => void;
  close: (code?: number, reason?: string) => void;
}>;

export type PermissionDecision = "allow" | "deny" | "allowAlways";

export type QuestionAnswers = Record<string, string | string[]>;

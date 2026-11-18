import { type AgentDefinition, loadAgentDefinitions } from "@yukino.js/yukino";

export type SubagentVo = Readonly<{
  name: string;
  description: string;
  model?: string;
  background: boolean;
  worktree: boolean;
}>;

export const listSubagents = (): SubagentVo[] =>
  loadAgentDefinitions().map((definition: AgentDefinition) => ({
    background: definition.background ?? false,
    description: definition.description,
    name: definition.name,
    worktree: definition.worktree ?? false,
    ...(definition.model !== undefined && { model: definition.model }),
  }));

import { Subagent } from "@yukino.js/yukino";

export type SubagentVo = Readonly<{
  name: string;
  description: string;
  model?: string;
  background: boolean;
  worktree: boolean;
}>;

export const listSubagents = (): SubagentVo[] =>
  Subagent.Loader.loadAgentDefinitions().map((definition: Subagent.Definition.AgentDefinition) => ({
    background: definition.background ?? false,
    description: definition.description,
    name: definition.name,
    worktree: definition.worktree ?? false,
    ...(definition.model !== undefined && { model: definition.model }),
  }));

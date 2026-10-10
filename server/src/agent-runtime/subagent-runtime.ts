import { Subagent } from "@yukino.js/yukino";

export type SubagentVo = Readonly<{
  name: string;
  description: string;
  model?: string;
  background: boolean;
  isolation?: "worktree";
}>;

export const listSubagents = (): SubagentVo[] =>
  Subagent.Loader.loadAgentDefinitions().map((definition: Subagent.Definition.AgentDefinition) => ({
    background: definition.background ?? false,
    description: definition.description,
    name: definition.name,
    ...(definition.model !== undefined && { model: definition.model }),
    ...(definition.isolation !== undefined && {
      isolation: definition.isolation,
    }),
  }));

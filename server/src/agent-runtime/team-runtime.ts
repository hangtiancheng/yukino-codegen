import { join } from "node:path";
import { Teams } from "@yukino.js/yukino";

export type TeamVo = Readonly<{
  name: string;
  mode: string;
  description?: string | undefined;
  memberCount: number;
  members: ReadonlyArray<{
    name: string;
    active: boolean;
    agentType?: string | undefined;
  }>;
}>;

export type TeamTaskVo = Readonly<{
  id: string;
  title: string;
  status: string;
  assignee: string;
}>;

const TEAM_MODES = new Set(["in-process", "tmux", "iterm"]);

const toMode = (backendType: string | undefined): string =>
  backendType !== undefined && TEAM_MODES.has(backendType)
    ? backendType
    : "in-process";

/**
 * Read-only projection of the persisted teams for capability endpoints.
 *
 * Teams live on disk under `~/.yukino/teams/<slug>/config.json` and are written
 * through on every membership change, so the team files — not a TeamManager
 * instance — are the source of truth here: `TeamManager.list()` only returns
 * teams cached in memory, which is always empty for a manager constructed
 * per-request.
 */
export const listTeams = (): TeamVo[] => {
  const result: TeamVo[] = [];
  for (const dirName of Teams.TeamFile.listTeamNames()) {
    const teamFile = Teams.TeamFile.readTeamFile(dirName);
    if (teamFile === null) continue;
    result.push({
      memberCount: teamFile.members.length,
      members: teamFile.members.map((member) => ({
        active: member.isActive === true,
        name: member.name,
        ...(member.agentType !== undefined && { agentType: member.agentType }),
      })),
      mode: toMode(
        teamFile.members.find((member) => member.backendType !== undefined)
          ?.backendType,
      ),
      name: teamFile.name,
      ...(teamFile.description !== undefined && {
        description: teamFile.description,
      }),
    });
  }
  return result;
};

/** Lists a team's shared task board; the store re-reads tasks.json on access. */
export const listTeamTasks = (teamName: string): TeamTaskVo[] => {
  const store = new Teams.SharedTask.SharedTaskStore(
    join(Teams.TeamFile.teamDir(teamName), "tasks.json"),
  );
  return store.listTasks().map((task) => ({
    assignee: task.assignee,
    id: task.id,
    status: task.status,
    title: task.title,
  }));
};

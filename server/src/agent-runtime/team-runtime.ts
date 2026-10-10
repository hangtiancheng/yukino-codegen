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

export const listTeams = (workDir: string): TeamVo[] => {
  const result: TeamVo[] = [];
  for (const dirName of Teams.TeamFile.listTeamNames(workDir)) {
    const teamFile = Teams.TeamFile.readTeamFile(workDir, dirName);
    if (teamFile === null) continue;
    result.push({
      memberCount: teamFile.members.length,
      members: teamFile.members.map((member) => ({
        active: member.isActive === true,
        name: member.name,
        ...(member.agentType !== undefined && { agentType: member.agentType }),
      })),
      mode: "in-process",
      name: teamFile.name,
      ...(teamFile.description !== undefined && {
        description: teamFile.description,
      }),
    });
  }
  return result;
};

export const listTeamTasks = (workDir: string, teamName: string): TeamTaskVo[] => {
  const store = new Teams.SharedTask.SharedTaskStore(
    join(Teams.TeamFile.teamDir(workDir, teamName), "tasks.json"),
  );
  return store.listTasks().map((task) => ({
    assignee: task.owner ?? "",
    id: task.id,
    status: task.status,
    title: task.subject,
  }));
};

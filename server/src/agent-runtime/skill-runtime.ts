import { Skills, type Tools } from "@yukino.js/yukino";

export type SkillVo = Readonly<{
  name: string;
  description: string;
  mode: "inline" | "fork";
  model?: string;
  forkContext?: "full" | "recent" | "none";
}>;

const toVo = (meta: Skills.SkillMeta): SkillVo => ({
  description: meta.description,
  mode: meta.mode ?? "inline",
  name: meta.name,
  ...(meta.model !== undefined && { model: meta.model }),
  ...(meta.forkContext !== undefined && { forkContext: meta.forkContext }),
});

/**
 * Read/administer the skills available in a workspace directory. Uses the
 * public SkillCatalog + InstallSkillTool; every call re-scans the workDir so it
 * reflects on-disk changes without needing the live agent handle.
 */
export const createSkillRuntime = (workDir: string) => {
  const catalog = new Skills.Catalog.SkillCatalog();
  catalog.load(workDir);

  const list = (): SkillVo[] => {
    if (catalog.needsReload()) catalog.reload();
    return catalog.list().map(toVo);
  };

  const reload = (): SkillVo[] => {
    catalog.reload();
    return catalog.list().map(toVo);
  };

  const install = async (
    source: string,
    name?: string,
  ): Promise<{ ok: boolean; output: string }> => {
    const tool = new Skills.InstallTool.InstallSkillTool(workDir, catalog);
    const ctx: Tools.Types.ToolContext = { workDir };
    const result = await tool.execute(ctx, {
      source,
      ...(name !== undefined && { name }),
    });
    catalog.reload();
    return { ok: !result.isError, output: result.output };
  };

  return { install, list, reload };
};

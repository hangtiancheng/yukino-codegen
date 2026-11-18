import {
  InstallSkillTool,
  SkillCatalog,
  type SkillMeta,
  type ToolContext,
} from "@yukino.js/yukino";

export type SkillVo = Readonly<{
  name: string;
  description: string;
  mode: "inline" | "fork";
  model?: string;
  forkContext?: "full" | "recent" | "none";
}>;

const toVo = (meta: SkillMeta): SkillVo => ({
  description: meta.description,
  mode: meta.mode ?? "inline",
  name: meta.name,
  ...(meta.model !== undefined && { model: meta.model }),
  ...(meta.forkContext !== undefined && { forkContext: meta.forkContext }),
});

export const createSkillRuntime = (workDir: string) => {
  const catalog = new SkillCatalog();
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
    const tool = new InstallSkillTool(workDir, catalog);
    const ctx: ToolContext = { cwd: workDir };
    const result = await tool.execute(ctx, {
      source,
      ...(name !== undefined && { name }),
    });
    catalog.reload();
    return { ok: !result.isError, output: result.output };
  };

  return { install, list, reload };
};

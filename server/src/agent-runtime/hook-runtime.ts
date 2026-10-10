import type { Config } from "@yukino.js/yukino";
import type { AgentHookModel } from "../generated/prisma/models/AgentHook.js";
import { toYukinoHookConfig } from "./hook-config.js";

export const buildHookConfigs = (rows: readonly AgentHookModel[]): Config.HookConfig[] =>
  rows.filter((row) => row.enabled).map(toYukinoHookConfig);

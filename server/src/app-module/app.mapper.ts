import type { AppModel } from "../generated/prisma/models/App.js";
import type { AppVo } from "./app.schema.js";

export const toAppVo = (entity: AppModel): AppVo => ({
  appCover: entity.appCover,
  appName: entity.appName,
  createTime: entity.createTime,
  id: entity.id.toString(),
  initPrompt: entity.initPrompt,
  priority: entity.priority,
  updateTime: entity.updateTime,
  userId: entity.userId.toString(),
});

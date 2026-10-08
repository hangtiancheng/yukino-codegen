import type { AppPageQuery } from "./app.schema.js";
import type { AppListFilter } from "./app-repository.js";

export const buildAppListFilter = (query: AppPageQuery): AppListFilter => ({
  ...(query.id !== undefined && { id: query.id }),
  ...(query.appName !== undefined && { appName: query.appName }),
  ...(query.initPrompt !== undefined && { initPrompt: query.initPrompt }),
  ...(query.priority !== undefined && { priority: query.priority }),
  ...(query.userId !== undefined && { userId: query.userId }),
});

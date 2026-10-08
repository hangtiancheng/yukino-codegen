import type { AppModel } from "../generated/prisma/models/App.js";

export type SortableAppField = keyof Pick<
  AppModel,
  "createTime" | "updateTime" | "priority" | "appName" | "id"
>;

const SORTABLE_APP_FIELDS: Record<SortableAppField, true> = {
  appName: true,
  createTime: true,
  id: true,
  priority: true,
  updateTime: true,
};

const isSortableAppField = (field: string): field is SortableAppField =>
  Object.hasOwn(SORTABLE_APP_FIELDS, field);

export const resolveAppSortField = (field: string | undefined): SortableAppField => {
  if (field !== undefined && isSortableAppField(field)) {
    return field;
  }
  return "createTime";
};

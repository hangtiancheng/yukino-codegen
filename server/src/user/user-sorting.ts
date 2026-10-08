import type { UserModel } from "../generated/prisma/models/User.js";

type UserModelField = keyof UserModel;

export type SortableUserField = Extract<
  UserModelField,
  "createTime" | "id" | "updateTime" | "userAccount" | "username" | "userRole"
>;

const SORTABLE_USER_FIELDS: Readonly<Record<SortableUserField, true>> = {
  createTime: true,
  id: true,
  updateTime: true,
  userAccount: true,
  username: true,
  userRole: true,
};

const isSortableUserField = (value: string): value is SortableUserField =>
  Object.hasOwn(SORTABLE_USER_FIELDS, value);

export const resolveSortField = (field: string | undefined): SortableUserField => {
  if (field !== undefined && isSortableUserField(field)) {
    return field;
  }
  return "createTime";
};

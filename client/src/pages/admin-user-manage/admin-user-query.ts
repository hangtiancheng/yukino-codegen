import {
  userIdSchema,
  userQueryRequestSchema,
  type UserQueryRequest,
  type UserRole,
} from "@/shared/schemas";
import {
  optionalPositiveInteger,
  optionalTrimmed,
} from "../admin-shared/filter-value";

export const adminUserPageSize = 10;

export type AdminUserFilterValues = {
  readonly id: string;
  readonly userAccount: string;
  readonly username: string;
  readonly userRole: UserRole | "";
};

export const initialAdminUserFilters: AdminUserFilterValues = {
  id: "",
  userAccount: "",
  username: "",
  userRole: "",
};

export function buildAdminUserQuery(
  filters: AdminUserFilterValues,
  pageNumber: number,
): UserQueryRequest {
  const id = optionalPositiveInteger(filters.id);
  return userQueryRequestSchema.parse({
    current: pageNumber,
    pageSize: adminUserPageSize,
    sortField: "createTime",
    sortOrder: "descend",
    id: id === undefined ? undefined : userIdSchema.parse(id),
    userAccount: optionalTrimmed(filters.userAccount),
    username: optionalTrimmed(filters.username),
    userRole: filters.userRole === "" ? undefined : filters.userRole,
  });
}

import { z } from "zod";

const canonicalUserRoleSchema = z.enum(["user", "admin"]);
const backendUserRoleSchema = z
  .enum(["USER", "ADMIN"])
  .transform((value) => value.toLowerCase())
  .pipe(canonicalUserRoleSchema);

export const userRoleSchema = z.union([
  canonicalUserRoleSchema,
  backendUserRoleSchema,
]);
export type UserRole = z.infer<typeof userRoleSchema>;

export function isAdminRole(role: UserRole): boolean {
  return role === "admin";
}

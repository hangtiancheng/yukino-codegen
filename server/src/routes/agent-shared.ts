import type { Context } from "hono";
import type { AppService } from "../app-module/index.js";
import { ErrorCode, HttpError, idSchema } from "../common/index.js";
import { UserRole } from "../generated/prisma/enums.js";
import type { AppHonoEnv } from "../session/index.js";
import type { SessionUser } from "../session/session.schema.js";

export type AppAccess = Readonly<{
  appId: bigint;
  ownerId: bigint;
  user: SessionUser;
  writable: boolean;
}>;

/**
 * Resolves the authenticated user, the target app, and whether the caller may
 * write. The canonical agent workspace belongs to the app owner; owners and
 * admins are writable, other logged-in users are read-only observers.
 */
export const resolveAppAccess = async (
  c: Context<AppHonoEnv>,
  appService: AppService,
): Promise<AppAccess> => {
  const user = c.get("user");
  if (user === undefined) {
    throw new HttpError(ErrorCode.NotLoginError, "User not logged in", 401);
  }
  const parsedAppId = idSchema.safeParse(c.req.param("appId"));
  if (!parsedAppId.success) {
    throw new HttpError(ErrorCode.ParamsError, "Invalid app id", 400);
  }
  const appId = parsedAppId.data;
  const app = await appService.requireActiveById(appId);
  const ownerId = app.userId;
  const writable = BigInt(user.id) === ownerId || user.userRole === UserRole.ADMIN;
  return { appId, ownerId, user, writable };
};

export const requireWritable = (access: AppAccess): void => {
  if (!access.writable) {
    throw new HttpError(ErrorCode.NoAuthError, "Owner or admin access required", 403);
  }
};

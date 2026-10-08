import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ErrorCode, generateSessionId, HttpError } from "../common/index.js";
import { env } from "../config/index.js";
import { UserRole } from "../generated/prisma/enums.js";
import type { LoginUserVo } from "../user/user.schema.js";
import type { AppHonoEnv } from "./hono-env.js";
import type { SessionPayload } from "./session.schema.js";
import type { SessionStore } from "./session-store.js";

export const SESSION_COOKIE_NAME = "yukino_codegen_session";

const cookieOptions = () => ({
  httpOnly: true,
  maxAge: env.SESSION_TTL_SECONDS,
  path: "/",
  sameSite: "Lax" as const,
  secure: env.NODE_ENV === "production",
});

export const issueSession = async (
  c: Context<AppHonoEnv>,
  store: SessionStore,
  user: LoginUserVo,
): Promise<string> => {
  const sessionId = generateSessionId();
  const payload: SessionPayload = {
    expiresAt: Date.now() + env.SESSION_TTL_SECONDS * 1000,
    user,
  };
  await store.set(sessionId, payload);
  setCookie(c, SESSION_COOKIE_NAME, sessionId, cookieOptions());
  c.set("sessionId", sessionId);
  c.set("user", payload.user);
  return sessionId;
};

export const revokeSession = async (
  c: Context<AppHonoEnv>,
  store: SessionStore,
): Promise<boolean> => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId === undefined) {
    return false;
  }
  await store.delete(sessionId);
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return true;
};

export const sessionMiddleware =
  (store: SessionStore): MiddlewareHandler<AppHonoEnv> =>
  async (c, next) => {
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (sessionId !== undefined) {
      const payload = await store.get(sessionId);
      if (payload !== undefined) {
        c.set("sessionId", sessionId);
        c.set("user", payload.user);
      }
    }
    await next();
  };

export const requireLogin: MiddlewareHandler<AppHonoEnv> = async (c, next) => {
  const user = c.get("user");
  if (user === undefined) {
    throw new HttpError(ErrorCode.NotLoginError, "User not logged in", 401);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler<AppHonoEnv> = async (c, next) => {
  const user = c.get("user");
  if (user === undefined) {
    throw new HttpError(ErrorCode.NotLoginError, "User not logged in", 401);
  }
  if (user.userRole !== UserRole.ADMIN) {
    throw new HttpError(ErrorCode.NoAuthError, "Admin role required", 403);
  }
  await next();
};

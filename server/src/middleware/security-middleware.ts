import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { createErrorResponse, ErrorCode, MAX_PROJECT_FILE_BODY_BYTES } from "../common/index.js";
import { env } from "../config/index.js";

export const corsOrigin = (): string | string[] =>
  env.CORS_ALLOWED_ORIGINS.includes("*") ? "*" : env.CORS_ALLOWED_ORIGINS;

export const createCorsMiddleware = () =>
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    origin: corsOrigin(),
  });

export const createBodyLimitMiddleware = (): MiddlewareHandler => {
  const onError = (c: Context) =>
    c.json(createErrorResponse(ErrorCode.ParamsError, "Request body is too large"), 413);
  const defaultLimit = bodyLimit({ maxSize: env.REQUEST_BODY_LIMIT_BYTES, onError });
  const fileWriteLimit = bodyLimit({ maxSize: MAX_PROJECT_FILE_BODY_BYTES, onError });
  return (c: Parameters<typeof defaultLimit>[0], next: Parameters<typeof defaultLimit>[1]) =>
    c.req.method === "PUT" && /\/app\/files\/[^/]+\/file$/u.test(c.req.path)
      ? fileWriteLimit(c, next)
      : defaultLimit(c, next);
};

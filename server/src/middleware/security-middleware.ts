import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { createErrorResponse, ErrorCode } from "../common/index.js";
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
  return bodyLimit({ maxSize: env.REQUEST_BODY_LIMIT_BYTES, onError });
};

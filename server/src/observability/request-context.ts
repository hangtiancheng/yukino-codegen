import type { MiddlewareHandler } from "hono";
import type { AppHonoEnv } from "../session/index.js";

export type RequestLogger = Readonly<{
  info: (input: Readonly<Record<string, string | number>>) => void;
}>;

const createRequestId = (): string => crypto.randomUUID();

export const createRequestContextMiddleware = (
  logger: RequestLogger = { info: (input) => console.info(JSON.stringify(input)) },
): MiddlewareHandler<AppHonoEnv> => {
  return async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? createRequestId();
    const startedAt = Date.now();
    c.header("x-request-id", requestId);
    await next();
    logger.info({
      durationMs: Date.now() - startedAt,
      method: c.req.method,
      path: c.req.path,
      requestId,
      status: c.res.status,
    });
  };
};

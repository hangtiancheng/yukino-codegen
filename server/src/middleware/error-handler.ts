import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createErrorResponse, ErrorCode, HttpError } from "../common/index.js";

const toContentfulStatusCode = (statusCode: number): ContentfulStatusCode => {
  switch (statusCode) {
    case 400:
      return 400;
    case 401:
      return 401;
    case 403:
      return 403;
    case 404:
      return 404;
    case 422:
      return 422;
    default:
      return 500;
  }
};

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof HttpError) {
    return c.json(createErrorResponse(error.code, error.message), error.statusCode);
  }

  if (error instanceof HTTPException) {
    const statusCode = toContentfulStatusCode(error.status);
    return c.json(createErrorResponse(ErrorCode.SystemError, error.message), statusCode);
  }

  console.error(error);
  return c.json(createErrorResponse(ErrorCode.SystemError, "Internal server error"), 500);
};

export const handleNotFound: NotFoundHandler = (c) =>
  c.json(createErrorResponse(ErrorCode.NotFoundError, "Route not found"), 404);

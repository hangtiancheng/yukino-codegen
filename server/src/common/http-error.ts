import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "./error-code.js";

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: ContentfulStatusCode;

  constructor(code: ErrorCode, message: string, statusCode: ContentfulStatusCode = 200) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

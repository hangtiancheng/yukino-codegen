import type { z } from "zod";
import { ApiException, type ApiError } from "./api-error";
import { decodeEnvelope } from "./decode-envelope";
import {
  buildUrl,
  readResponse,
  type HttpRequestOptions,
} from "./http-request";

export type HttpClient = {
  readonly request: <TSchema extends z.ZodType>(
    options: HttpRequestOptions,
    dataSchema: TSchema,
  ) => Promise<z.output<TSchema>>;
};

function toApiException(cause: unknown): ApiException {
  if (cause instanceof ApiException) return cause;
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return new ApiException({ kind: "aborted", message: "request aborted" });
  }
  const error: ApiError = {
    kind: "network",
    message: cause instanceof Error ? cause.message : "network failed",
    cause,
  };
  return new ApiException(error);
}

function buildInit(options: HttpRequestOptions): RequestInit {
  return {
    method: options.method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

export function createHttpClient(resolveBaseUrl: () => string): HttpClient {
  return {
    async request<TSchema extends z.ZodType>(
      options: HttpRequestOptions,
      dataSchema: TSchema,
    ): Promise<z.output<TSchema>> {
      const finalUrl = buildUrl(resolveBaseUrl(), options);
      let response: Response;
      try {
        response = await fetch(finalUrl, buildInit(options));
      } catch (cause) {
        throw toApiException(cause);
      }
      const envelope = await readResponse(response);
      return decodeEnvelope(
        envelope,
        dataSchema,
        options.suppressUnauthorizedRedirect === true
          ? { suppressUnauthorizedRedirect: true }
          : {},
      );
    },
  };
}

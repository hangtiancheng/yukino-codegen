import { z } from "zod";
import { reportRuntimeIssue } from "@/shared/observability";
import { isSuccessCode } from "@/shared/schemas";
import { ApiException } from "./api-error";
import type { ResponseEnvelope } from "./http-request";
import { notifyUnauthorized, unauthorizedCode } from "./unauthorized-handler";

const metaEnvelopeSchema = z.object({
  code: z.number().int(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

function parseJson(text: string, url: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    reportRuntimeIssue({
      kind: "schema-parse-failure",
      message: "response body was not valid JSON",
      context: { url },
      cause,
    });
    throw new ApiException({
      kind: "parse",
      message: cause instanceof Error ? cause.message : "invalid JSON",
      issues: [],
    });
  }
}

export function decodeEnvelope<TSchema extends z.ZodType>(
  envelope: ResponseEnvelope,
  dataSchema: TSchema,
  options: Readonly<{ suppressUnauthorizedRedirect?: boolean }> = {},
): z.output<TSchema> {
  if (envelope.status === 404 || envelope.status >= 500) {
    throw new ApiException({
      kind: "http",
      status: envelope.status,
      message: envelope.text || "server error",
    });
  }
  const parsedBody = parseJson(envelope.text, envelope.url);
  const meta = metaEnvelopeSchema.safeParse(parsedBody);
  if (!meta.success) {
    reportRuntimeIssue({
      kind: "schema-parse-failure",
      message: "response did not match base envelope",
      context: { url: envelope.url },
      cause: meta.error,
    });
    throw new ApiException({
      kind: "parse",
      message: "response did not match base envelope",
      issues: meta.error.issues.map((issue) => issue.message),
    });
  }
  const { code, message, data } = meta.data;
  if (code === unauthorizedCode) {
    if (options.suppressUnauthorizedRedirect !== true) {
      notifyUnauthorized(envelope.url);
    }
    throw new ApiException({
      kind: "unauthorized",
      code,
      message: message ?? "Please login first",
    });
  }
  if (!isSuccessCode(code)) {
    throw new ApiException({
      kind: "business",
      code,
      message: message ?? "Request failed",
    });
  }
  const dataResult = dataSchema.safeParse(data);
  if (!dataResult.success) {
    reportRuntimeIssue({
      kind: "schema-parse-failure",
      message: "response data did not match schema",
      context: { url: envelope.url },
      cause: dataResult.error,
    });
    throw new ApiException({
      kind: "parse",
      message: "response data did not match schema",
      issues: dataResult.error.issues.map((issue) => issue.message),
    });
  }
  return dataResult.data;
}

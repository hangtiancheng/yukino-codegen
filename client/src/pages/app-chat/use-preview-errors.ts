import { useCallback, useEffect, useState, type RefObject } from "react";
import { z } from "zod";
import { reportRuntimeIssue } from "@/shared/observability";
import type { PreviewRuntimeError } from "./build-error-context";

const previewErrorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PREVIEW_UNCAUGHT_EXCEPTION"),
    message: z.string(),
    stack: z.string().optional(),
  }),
  z.object({
    type: z.literal("PREVIEW_UNHANDLED_REJECTION"),
    message: z.string(),
    stack: z.string().optional(),
  }),
  z.object({
    type: z.literal("PREVIEW_CONSOLE_ERROR"),
    args: z.array(z.unknown()),
    stack: z.string().optional(),
  }),
]);

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toRuntimeError = (value: unknown): PreviewRuntimeError | undefined => {
  const parsed = previewErrorSchema.safeParse(value);
  if (!parsed.success) return undefined;
  if (parsed.data.type === "PREVIEW_CONSOLE_ERROR") {
    return {
      message: parsed.data.args.map(stringifyValue).join(" "),
      ...(parsed.data.stack !== undefined && { stack: parsed.data.stack }),
    };
  }
  return {
    message: parsed.data.message,
    ...(parsed.data.stack !== undefined && { stack: parsed.data.stack }),
  };
};

export type PreviewErrors = Readonly<{
  clear: () => void;
  latest: PreviewRuntimeError | undefined;
}>;

export function usePreviewErrors(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  previewUrl?: string,
): PreviewErrors {
  const [latest, setLatest] = useState<PreviewRuntimeError>();
  const clear = useCallback(() => setLatest(undefined), []);

  useEffect(() => {
    if (previewUrl === undefined) return;
    const origin = new URL(previewUrl).origin;
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.origin !== origin
      )
        return;
      const error = toRuntimeError(event.data);
      if (error === undefined) return;
      setLatest(error);
      reportRuntimeIssue({
        kind: "preview-runtime-failure",
        message: error.message,
        ...(error.stack !== undefined && {
          context: { stack: error.stack },
        }),
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef, previewUrl]);

  return { clear, latest };
}

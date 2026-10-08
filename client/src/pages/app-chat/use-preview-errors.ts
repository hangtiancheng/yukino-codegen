import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { reportRuntimeIssue } from "@/shared/observability";
import { getWebContainer } from "@/shared/webcontainer";
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

export function usePreviewErrors(): PreviewErrors {
  const [latest, setLatest] = useState<PreviewRuntimeError>();
  const clear = useCallback(() => setLatest(undefined), []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void getWebContainer()
      .then((container) => {
        if (cancelled) return;
        unsubscribe = container.on("preview-message", (message) => {
          const error = toRuntimeError(message);
          if (error === undefined) return;
          setLatest(error);
          reportRuntimeIssue({
            kind: "preview-runtime-failure",
            message: error.message,
            ...(error.stack !== undefined && {
              context: { stack: error.stack },
            }),
          });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { clear, latest };
}

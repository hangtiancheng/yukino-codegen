import { AlertTriangle, WandSparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button, LoadingButton } from "@/shared/ui";
import type { PreviewRuntimeError } from "./build-error-context";

export type PreviewErrorPanelProps = Readonly<{
  canFix: boolean;
  error: PreviewRuntimeError | undefined;
  fixing: boolean;
  onClear: () => void;
  onFix: () => void;
}>;

export function PreviewErrorPanel({
  canFix,
  error,
  fixing,
  onClear,
  onFix,
}: PreviewErrorPanelProps): ReactNode {
  if (error === undefined) return null;
  return (
    <aside className="border-destructive/30 bg-destructive/5 shadow-soft rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-destructive flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Preview Error
          </h2>
          <p className="text-foreground mt-2 text-sm">{error.message}</p>
          {error.stack !== undefined ? (
            <pre className="text-muted-foreground mt-2 max-h-24 overflow-auto text-xs whitespace-pre-wrap">
              {error.stack}
            </pre>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" aria-hidden="true" />
          Clear
        </Button>
      </div>
      {canFix ? (
        <LoadingButton
          className="mt-3"
          size="sm"
          isLoading={fixing}
          onClick={onFix}
        >
          <WandSparkles className="size-4" aria-hidden="true" />
          Fix with AI
        </LoadingButton>
      ) : null}
    </aside>
  );
}

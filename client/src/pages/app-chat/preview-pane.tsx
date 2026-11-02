import { type ReactNode } from "react";
import { cn } from "cn";
import type { PreviewRuntimeError } from "./build-error-context";
import { usePreview } from "./preview-context";
import { PreviewErrorPanel } from "./preview-error-panel";
import { PreviewPanel } from "./preview-panel";

export type PreviewPaneProps = {
  readonly canEdit: boolean;
  readonly canFix: boolean;
  readonly onFixError: (error: PreviewRuntimeError) => void;
  readonly className?: string;
};

export function PreviewPane({
  canEdit,
  canFix,
  onFixError,
  className,
}: PreviewPaneProps): ReactNode {
  const preview = usePreview();
  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <PreviewPanel
        canEdit={canEdit}
        editMode={preview.editMode}
        error={preview.error}
        generating={preview.agentRunning}
        iframeRef={preview.iframeRef}
        logs={preview.logs}
        onIframeLoad={preview.handleIframeLoad}
        onRefresh={preview.reloadPreview}
        onRetry={preview.resync}
        onToggleEditMode={preview.toggleEditMode}
        previewUrl={preview.previewUrl}
        status={preview.status}
      />
      <PreviewErrorPanel
        canFix={canFix}
        error={preview.previewError}
        fixing={preview.agentRunning}
        onClear={preview.clearPreviewError}
        onFix={() => {
          const error = preview.previewError;
          if (error !== undefined) {
            onFixError(error);
            preview.clearPreviewError();
          }
        }}
      />
    </div>
  );
}

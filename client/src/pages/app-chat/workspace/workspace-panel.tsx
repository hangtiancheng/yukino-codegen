import { Code2, Eye } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/shared/ui";
import type { PreviewRuntimeError } from "../build-error-context";
import { PreviewErrorPanel } from "../preview-error-panel";
import { PreviewPanel } from "../preview-panel";
import { CodeWorkspace } from "./code-workspace";
import { useWorkspace } from "./workspace-context";

type WorkspaceTab = "preview" | "code";

export type WorkspacePanelProps = {
  /** Owner may toggle the visual editor over the preview. */
  readonly canEdit: boolean;
  /** Whether the "Fix with AI" affordance is shown for preview errors. */
  readonly canFix: boolean;
  /** Invoked with the current preview error when the user asks the agent to fix it. */
  readonly onFixError: (error: PreviewRuntimeError) => void;
  readonly className?: string;
};

/**
 * The unified right-side workspace: a Preview tab reusing the existing preview,
 * visual editor, and error-fix flow, plus a Code tab with the Monaco IDE. Both
 * surfaces stay mounted and are toggled with `hidden`; the Code surface is only
 * mounted on first selection so Monaco loads lazily.
 */
export function WorkspacePanel({
  canEdit,
  canFix,
  onFixError,
  className,
}: WorkspacePanelProps): ReactNode {
  const workspace = useWorkspace();
  const [tab, setTab] = useState<WorkspaceTab>("preview");
  const [codeMounted, setCodeMounted] = useState(false);

  useEffect(() => {
    if (tab === "code") setCodeMounted(true);
  }, [tab]);

  return (
    <section
      className={cn(
        "border-border/80 bg-card shadow-soft flex min-h-0 flex-col overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        role="tablist"
        className="border-border/70 bg-muted/25 flex items-center gap-1 border-b px-2 py-1.5"
      >
        <TabButton
          active={tab === "preview"}
          onClick={() => setTab("preview")}
          icon={<Eye className="size-4" aria-hidden="true" />}
        >
          Preview
        </TabButton>
        <TabButton
          active={tab === "code"}
          onClick={() => setTab("code")}
          icon={<Code2 className="size-4" aria-hidden="true" />}
        >
          Code
        </TabButton>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "flex h-full min-h-0 flex-col gap-3 p-3",
            tab !== "preview" && "hidden",
          )}
        >
          <PreviewPanel
            canEdit={canEdit}
            editMode={workspace.editMode}
            error={workspace.error}
            generating={workspace.agentRunning}
            iframeRef={workspace.iframeRef}
            logs={workspace.logs}
            onIframeLoad={workspace.handleIframeLoad}
            onRefresh={workspace.reloadPreview}
            onRetry={workspace.resync}
            onToggleEditMode={workspace.toggleEditMode}
            previewUrl={workspace.previewUrl}
            status={workspace.status}
          />
          <PreviewErrorPanel
            canFix={canFix}
            error={workspace.previewError}
            fixing={workspace.agentRunning}
            onClear={workspace.clearPreviewError}
            onFix={() => {
              const error = workspace.previewError;
              if (error !== undefined) {
                onFixError(error);
                workspace.clearPreviewError();
              }
            }}
          />
        </div>
        {codeMounted ? (
          <div
            className={cn(
              "absolute inset-0 min-h-0",
              tab !== "code" && "hidden",
            )}
          >
            <CodeWorkspace active={tab === "code"} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  );
}

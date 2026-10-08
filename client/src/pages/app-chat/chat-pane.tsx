import { AlertTriangle, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import type { AppId, VisualEditorElementInfo } from "@/shared/schemas";
import { Button } from "@/shared/ui";
import { useWorkspace } from "./workspace";
import { AgentComposer } from "./chat/agent-composer";
import { AgentStatusBar } from "./chat/agent-status-bar";
import { AgentTranscriptView } from "./chat/agent-transcript-view";
import { CapabilityDrawer } from "./chat/capability-drawer";
import {
  AgentQuestionDialog,
  PermissionDialog,
} from "./chat/permission-dialog";
import type {
  AgentRunOptions,
  PermissionDecision,
  QuestionAnswers,
} from "./use-agent-socket";
import type {
  AgentTranscriptAction,
  AgentTranscriptState,
} from "./use-agent-transcript";
import { isAgentBusy } from "./use-agent-transcript";

export type ChatPaneProps = {
  readonly appId: AppId;
  readonly state: AgentTranscriptState;
  readonly canRun: boolean;
  readonly run: (input: string, options?: AgentRunOptions) => boolean;
  readonly abort: () => boolean;
  readonly respondPermission: (
    interactionId: string,
    decision: PermissionDecision,
  ) => boolean;
  readonly respondQuestion: (
    interactionId: string,
    answers: QuestionAnswers,
  ) => boolean;
  readonly dispatch: React.Dispatch<AgentTranscriptAction>;
  readonly className?: string;
};

function elementLabel(element: VisualEditorElementInfo): string {
  const id = element.id.length > 0 ? `#${element.id}` : "";
  return `${element.tagName.toLowerCase()}${id} · ${element.selector}`;
}

export function ChatPane({
  appId,
  state,
  canRun,
  run,
  abort,
  respondPermission,
  respondQuestion,
  dispatch,
  className,
}: ChatPaneProps): ReactNode {
  const workspace = useWorkspace();
  const [input, setInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = isAgentBusy(state.runtimeStatus);
  const connected = state.connectionState === "connected";
  const lastCommand = state.commandResults.at(-1);

  const handleSend = async (): Promise<void> => {
    const text = input.trim();
    if (
      text.length === 0 ||
      !canRun ||
      busy ||
      !connected ||
      submittingRef.current
    ) {
      return;
    }
    const selected = workspace.selectedElement;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await workspace.flushTerminalSync();
      await workspace.saveAll();
      const ok = run(
        text,
        selected === undefined ? {} : { selectedElement: selected },
      );
      if (ok) {
        setInput("");
        workspace.clearSelection();
      } else {
        toast.error("Unable to start the agent run");
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Workspace changes failed to save",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePermission = (
    interactionId: string,
    decision: PermissionDecision,
  ): void => {
    if (!respondPermission(interactionId, decision)) {
      toast.error("Unable to send the permission response");
    }
  };

  const handleQuestion = (
    interactionId: string,
    answers: QuestionAnswers,
  ): void => {
    if (!respondQuestion(interactionId, answers)) {
      toast.error("Unable to send the answer");
    }
  };

  return (
    <section
      className={cn(
        "border-border/80 bg-card shadow-soft flex min-h-0 flex-col overflow-hidden rounded-xl border",
        className,
      )}
    >
      <AgentStatusBar
        connectionState={state.connectionState}
        runtimeStatus={state.runtimeStatus}
        permissionMode={state.permissionMode}
        readOnly={state.readOnly || !canRun}
        onOpenCapabilities={() => setDrawerOpen(true)}
      />
      <AgentTranscriptView
        events={state.events}
        streamingText={state.streamingText}
        thinkingText={state.thinkingText}
        runtimeStatus={state.runtimeStatus}
        replaying={state.replaying}
      />
      {lastCommand !== undefined ? (
        <div className="border-border/70 bg-muted/20 border-t px-3 py-1.5 text-xs">
          <span className="font-mono font-medium">/{lastCommand.command}</span>
          {lastCommand.error !== undefined ? (
            <span className="text-destructive ml-2">{lastCommand.error}</span>
          ) : lastCommand.result !== undefined ? (
            <pre className="text-muted-foreground mt-1 max-h-40 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(lastCommand.result, null, 2)}
            </pre>
          ) : (
            <span className="text-muted-foreground ml-2">ok</span>
          )}
        </div>
      ) : null}
      {state.errors.length > 0 ? (
        <div className="border-border/70 space-y-1 border-t px-3 py-1.5">
          {state.errors.slice(-3).map((error) => (
            <div
              key={error.id}
              className="text-destructive flex items-center gap-2 text-xs"
            >
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{error.message}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  dispatch({ type: "dismiss_error", id: error.id })
                }
                aria-label="Dismiss error"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="border-border/70 border-t p-2.5">
        <AgentComposer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onAbort={abort}
          candidates={state.candidates}
          running={busy}
          readOnly={!canRun || state.readOnly || submitting}
          connected={connected}
          selectedElementLabel={
            workspace.selectedElement === undefined
              ? undefined
              : elementLabel(workspace.selectedElement)
          }
          onClearSelectedElement={workspace.clearSelection}
        />
      </div>
      <PermissionDialog
        request={state.pendingPermission}
        onDecision={handlePermission}
      />
      <AgentQuestionDialog
        request={state.pendingQuestion}
        onSubmit={handleQuestion}
      />
      <CapabilityDrawer
        appId={appId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canManage={canRun}
        onNewSession={() => {
          run("/clear");
          setDrawerOpen(false);
        }}
        onPermissionModeChange={(mode) =>
          dispatch({ type: "permission_mode", permissionMode: mode })
        }
      />
    </section>
  );
}

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import type { AppId, VisualEditorElementInfo } from "@/shared/schemas";
import { Button } from "@/shared/ui";
import { useWorkspace } from "./workspace";
import { AgentComposer } from "./chat/agent-composer";
import { ActivityPanel } from "./chat/activity-panel";
import { ModelPicker, ThinkingPicker } from "./chat/agent-pickers";
import { AgentStatusBar } from "./chat/agent-status-bar";
import { AgentTranscriptView } from "./chat/agent-transcript-view";
import { CapabilityDrawer } from "./chat/capability-drawer";
import { CodeReviewDialog } from "./chat/code-review-dialog";
import {
  AgentQuestionDialog,
  PermissionDialog,
} from "./chat/permission-dialog";
import { PlanApprovalDialog } from "./chat/plan-approval-dialog";
import { RewindDialog } from "./chat/rewind-dialog";
import type {
  AgentRunOptions,
  CodeReviewStartInput,
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
  readonly respondPlanApproval: (
    choice: "yolo" | "manual" | "feedback",
    feedback?: string,
  ) => boolean;
  readonly startCodeReview: (options: CodeReviewStartInput) => boolean;
  readonly rewind: (
    sha: string,
    action: "code_and_conversation" | "conversation_only" | "code_only",
  ) => boolean;
  readonly requestFileCompletions: (
    requestId: string,
    query: string,
  ) => boolean;
  readonly uploadImage: (
    clientId: string,
    name: string,
    dataBase64: string,
  ) => boolean;
  readonly backgroundShells: () => boolean;
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
  respondPlanApproval,
  startCodeReview,
  rewind,
  requestFileCompletions,
  uploadImage,
  backgroundShells,
  dispatch,
  className,
}: ChatPaneProps): ReactNode {
  const workspace = useWorkspace();
  const [input, setInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = isAgentBusy(state.runtimeStatus);
  const connected = state.connectionState === "connected";
  const lastCommand = state.commandResults.at(-1);

  const handleSend = async (): Promise<void> => {
    const text = input.trim();
    // While a turn runs the message becomes steering (Remote parity), so the
    // busy guard only applies to the workspace flush below.
    if (text.length === 0 || !canRun || !connected || submittingRef.current) {
      return;
    }
    const selected = workspace.selectedElement;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (!busy) {
        await workspace.flushTerminalSync();
        await workspace.saveAll();
      }
      const ok = run(
        text,
        selected === undefined || busy ? {} : { selectedElement: selected },
      );
      if (ok) {
        setInput("");
        if (!busy) workspace.clearSelection();
      } else {
        toast.error("Unable to reach the agent");
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

  // Ctrl+B parity: background running foreground agent shells.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        backgroundShells();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backgroundShells]);

  const agentCount =
    state.activity.subagents.filter((agent) => agent.status === "running")
      .length +
    state.activity.tasks.filter((task) => task.status === "running").length +
    state.activity.teammates.length;

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
        model={state.model}
        thinkingLevel={state.thinkingLevel}
        usage={state.usage}
        agentCount={agentCount}
        onOpenActivity={() => setActivityOpen((open) => !open)}
      />
      {activityOpen ? (
        <div className="border-border/70 max-h-64 shrink-0 overflow-hidden border-b">
          <ActivityPanel
            activity={state.activity}
            onClose={() => setActivityOpen(false)}
          />
        </div>
      ) : null}
      <AgentTranscriptView
        events={state.events}
        streamingText={state.streamingText}
        thinkingText={state.thinkingText}
        runtimeStatus={state.runtimeStatus}
        replaying={state.replaying}
      />
      {state.codeReviewProgress !== undefined ? (
        <div className="border-border/70 bg-muted/20 flex items-center gap-2 border-t px-3 py-1.5 text-xs">
          <span className="text-muted-foreground font-mono">
            [review:{state.codeReviewProgress.phase}]
          </span>
          <span className="min-w-0 flex-1 truncate">
            {state.codeReviewProgress.message}
          </span>
        </div>
      ) : null}
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
          history={state.history}
          steering={state.steering}
          followUps={state.followUps}
          fileMatches={state.fileMatches}
          imageResults={state.imageResults}
          onRequestFileCompletions={requestFileCompletions}
          onUploadImage={uploadImage}
          onConsumeImageResult={(clientId) =>
            dispatch({ type: "consume_image_result", clientId })
          }
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
      <PlanApprovalDialog
        request={state.planApproval}
        onChoose={(choice, feedback) => {
          dispatch({ type: "close_plan_approval" });
          if (!respondPlanApproval(choice, feedback)) {
            toast.error("Unable to send the plan decision");
          }
        }}
      />
      <ModelPicker
        state={state.modelPicker}
        onSelect={(model) => {
          dispatch({ type: "close_model_picker" });
          run(`/model ${model}`);
        }}
        onClose={() => dispatch({ type: "close_model_picker" })}
      />
      <ThinkingPicker
        form={state.thinkingPicker}
        onSelect={(level) => {
          dispatch({ type: "close_thinking_picker" });
          run(`/thinking ${level}`);
        }}
        onClose={() => dispatch({ type: "close_thinking_picker" })}
      />
      <RewindDialog
        snapshots={state.rewindPicker}
        onAction={(sha, action) => {
          dispatch({ type: "close_rewind_picker" });
          if (!rewind(sha, action)) {
            toast.error("Unable to send the rewind action");
          }
        }}
        onClose={() => dispatch({ type: "close_rewind_picker" })}
      />
      <CodeReviewDialog
        open={state.codeReviewOpen}
        progress={state.codeReviewProgress}
        onRun={(options) => {
          dispatch({ type: "close_code_review" });
          if (!startCodeReview(options)) {
            toast.error("Unable to start the code review");
          }
        }}
        onClose={() => dispatch({ type: "close_code_review" })}
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

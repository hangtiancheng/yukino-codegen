import { useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "cn";
import { selectIsAdmin, useUserStore } from "@/shared/auth";
import { useMediaQuery } from "@/shared/lib";
import { useDeleteApp, useDeleteAppByAdmin } from "@/shared/query";
import { type AppVo } from "@/shared/schemas";
import { AppDetailModal } from "@/shared/ui";
import { buildPreviewFixPrompt } from "./build-error-context";
import { handleChatDownload } from "./chat-action-handlers";
import { ChatHeader } from "./chat-header";
import { ChatPane } from "./chat-pane";
import { useAgentSocket } from "./use-agent-socket";
import { isAgentBusy, useAgentTranscript } from "./use-agent-transcript";
import { WorkspacePanel, WorkspaceProvider } from "./workspace";

export function AppChatWorkspace({ app }: { readonly app: AppVo }): ReactNode {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const user = useUserStore((state) => state.user);
  const isAdmin = useUserStore(selectIsAdmin);
  const deleteApp = useDeleteApp();
  const deleteAppByAdmin = useDeleteAppByAdmin();

  const isOwner = app.userId === user?.id;
  const canManage = isAdmin || isOwner;

  const { state, dispatch } = useAgentTranscript();
  const socket = useAgentSocket({
    appId: app.id,
    sessionId: state.sessionId,
    lastSequence: state.lastSequence,
    dispatch,
  });
  const agentRunning = isAgentBusy(state.runtimeStatus);
  // Two panes side by side stop being usable on a phone; stack them instead.
  const stacked = !useMediaQuery("(min-width: 768px)");

  // A freshly created app carries its initial prompt but no transcript yet.
  // Once the socket connects and replays an empty history, send that prompt
  // once: it becomes the first user message and scaffolds the project. Guarding
  // on an empty, idle, fully-replayed session prevents re-sending on reconnect,
  // for existing apps, or after `/clear`.
  const initialPromptSentRef = useRef(false);
  const runAgent = socket.run;
  useEffect(() => {
    if (initialPromptSentRef.current) return;
    if (!canManage) return;
    if (state.connectionState !== "connected") return;
    if (state.replaying || !state.replayComplete) return;
    if (state.runtimeStatus !== "idle") return;
    if (state.events.length > 0) return;
    if (runAgent(app.initPrompt)) initialPromptSentRef.current = true;
  }, [
    app.initPrompt,
    canManage,
    runAgent,
    state.connectionState,
    state.events.length,
    state.replayComplete,
    state.replaying,
    state.runtimeStatus,
  ]);

  return (
    <div className="flex h-[calc(100dvh-7.75rem)] min-h-[40rem] flex-col gap-2.5 px-3 py-3 md:px-4 md:py-4">
      <ChatHeader
        app={app}
        canManage={canManage}
        downloading={downloading}
        onDetails={() => setDetailsOpen(true)}
        onEdit={() => navigate(`/app/edit/${app.id}`)}
        onDownload={() => handleChatDownload(app, setDownloading)}
      />
      <WorkspaceProvider
        appId={app.id}
        enabled
        agentRunning={agentRunning}
        filesRevision={state.filesRevision}
      >
        <Group
          key={stacked ? "stacked" : "side-by-side"}
          orientation={stacked ? "vertical" : "horizontal"}
          className="min-h-0 flex-1"
        >
          <Panel defaultSize={stacked ? "52" : "42"} minSize="26">
            <ChatPane
              appId={app.id}
              state={state}
              canRun={canManage && !state.replaying}
              run={socket.run}
              abort={socket.abort}
              respondPermission={socket.respondPermission}
              respondQuestion={socket.respondQuestion}
              dispatch={dispatch}
              className="h-full"
            />
          </Panel>
          <Separator
            className={cn(
              "group flex shrink-0 items-center justify-center outline-none",
              stacked ? "h-2 w-full" : "h-full w-2",
            )}
          >
            <span
              className={cn(
                "bg-border group-hover:bg-primary/50 rounded-full transition-colors",
                stacked ? "h-1 w-16" : "h-16 w-1",
              )}
            />
          </Separator>
          <Panel defaultSize={stacked ? "48" : "58"} minSize="30">
            <WorkspacePanel
              className="h-full"
              canEdit={isOwner}
              canFix={canManage && !state.replaying}
              onFixError={(error) => {
                socket.run(buildPreviewFixPrompt(error), {
                  previewError: error.message,
                });
              }}
            />
          </Panel>
        </Group>
      </WorkspaceProvider>
      <AppDetailModal
        open={detailsOpen}
        app={app}
        showActions={canManage}
        onOpenChange={setDetailsOpen}
        onEdit={() => navigate(`/app/edit/${app.id}`)}
        onDelete={() => {
          const mutation = isAdmin ? deleteAppByAdmin : deleteApp;
          mutation.mutate(
            { id: app.id },
            {
              onSuccess: () => navigate("/", { replace: true }),
              onError: () => toast.error("Delete failed"),
            },
          );
        }}
      />
    </div>
  );
}

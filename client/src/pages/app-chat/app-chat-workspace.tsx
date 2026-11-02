import { useEffect, useRef, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "cn";
import { selectIsAdmin, useUserStore } from "@/shared/auth";
import { useMediaQuery } from "@/shared/lib";
import { type AppVo } from "@/shared/schemas";
import { buildPreviewFixPrompt } from "./build-error-context";
import { ChatPane } from "./chat-pane";
import { PreviewPane } from "./preview-pane";
import { PreviewProvider } from "./preview-provider";
import { useAgentSocket } from "./use-agent-socket";
import { isAgentBusy, useAgentTranscript } from "./use-agent-transcript";

export function AppChatWorkspace({ app }: { readonly app: AppVo }): ReactNode {
  const user = useUserStore((state) => state.user);
  const isAdmin = useUserStore(selectIsAdmin);

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
  const stacked = !useMediaQuery("(min-width: 768px)");

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
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 md:gap-2.5 md:p-2.5">
      <PreviewProvider
        appId={app.id}
        enabled
        canEdit={isOwner}
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
              respondPlanApproval={socket.respondPlanApproval}
              rewind={socket.rewind}
              requestFileCompletions={socket.requestFileCompletions}
              uploadImage={socket.uploadImage}
              backgroundShells={socket.backgroundShells}
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
            <PreviewPane
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
      </PreviewProvider>
    </div>
  );
}

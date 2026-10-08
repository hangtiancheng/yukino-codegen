import { SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";
import { Badge, Button } from "@/shared/ui";
import type {
  AgentConnectionState,
  AgentRuntimeStatus,
} from "../use-agent-transcript";

const CONNECTION_LABEL: Record<AgentConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  handshaking: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

const RUNTIME_LABEL: Record<AgentRuntimeStatus, string> = {
  idle: "Ready",
  running: "Running",
  waiting: "Waiting",
  stopped: "Stopped",
  error: "Error",
};

export type AgentStatusBarProps = {
  readonly connectionState: AgentConnectionState;
  readonly runtimeStatus: AgentRuntimeStatus;
  readonly permissionMode: string | undefined;
  readonly readOnly: boolean;
  readonly onOpenCapabilities: () => void;
};

export function AgentStatusBar({
  connectionState,
  runtimeStatus,
  permissionMode,
  readOnly,
  onOpenCapabilities,
}: AgentStatusBarProps): ReactNode {
  const connected = connectionState === "connected";
  const busy = runtimeStatus === "running" || runtimeStatus === "waiting";
  return (
    <div className="border-border/70 bg-muted/25 text-muted-foreground flex items-center gap-2.5 border-b px-3 py-1.5 text-[11px] font-medium">
      <span className="flex items-center gap-1.5">
        <span className="relative flex size-2" aria-hidden="true">
          {connected ? (
            <span className="bg-emerald-500/40 absolute inline-flex size-full animate-ping rounded-full" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              connected
                ? "bg-emerald-500"
                : connectionState === "disconnected"
                  ? "bg-destructive"
                  : "bg-amber-500",
            )}
          />
        </span>
        {CONNECTION_LABEL[connectionState]}
      </span>
      <span className="bg-border/70 h-3 w-px" aria-hidden="true" />
      <span
        className={cn(
          "flex items-center gap-1.5",
          busy && "text-primary font-semibold",
          runtimeStatus === "error" && "text-destructive",
        )}
      >
        {RUNTIME_LABEL[runtimeStatus]}
      </span>
      {permissionMode !== undefined ? (
        <span className="bg-muted text-muted-foreground ml-auto rounded-md px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase">
          {permissionMode.replace(/_/g, " ").toLowerCase()}
        </span>
      ) : (
        <span className="ml-auto" />
      )}
      {readOnly ? (
        <Badge variant="secondary" className="text-[10px]">
          read-only
        </Badge>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        onClick={onOpenCapabilities}
        aria-label="Open capabilities"
      >
        <SlidersHorizontal data-icon="inline-start" />
        Capabilities
      </Button>
    </div>
  );
}

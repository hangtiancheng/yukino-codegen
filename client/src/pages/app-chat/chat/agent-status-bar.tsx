import { Activity, SlidersHorizontal } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";
import { Badge, Button } from "@/shared/ui";
import type {
  AgentConnectionState,
  AgentRuntimeStatus,
  AgentUsage,
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
  /** Remote parity extras */
  readonly model: string | undefined;
  readonly thinkingLevel: string | undefined;
  readonly usage: AgentUsage | undefined;
  readonly agentCount: number;
  readonly onOpenActivity: () => void;
};

export function AgentStatusBar({
  connectionState,
  runtimeStatus,
  permissionMode,
  readOnly,
  onOpenCapabilities,
  model,
  thinkingLevel,
  usage,
  agentCount,
  onOpenActivity,
}: AgentStatusBarProps): ReactNode {
  const connected = connectionState === "connected";
  const busy = runtimeStatus === "running" || runtimeStatus === "waiting";
  return (
    <div className="border-border/70 bg-muted/25 text-muted-foreground flex items-center gap-2.5 border-b px-3 py-1.5 text-[11px] font-medium">
      <span className="flex items-center gap-1.5">
        <span className="relative flex size-2" aria-hidden="true">
          {connected ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/40" />
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
      {model !== undefined && model.length > 0 ? (
        <span className="hidden max-w-40 truncate font-mono text-[10px] md:inline">
          {model}
        </span>
      ) : null}
      {thinkingLevel !== undefined && thinkingLevel.length > 0 ? (
        <span className="bg-muted hidden rounded-md px-1.5 py-0.5 text-[10px] capitalize md:inline">
          {thinkingLevel}
        </span>
      ) : null}
      {usage !== undefined && usage.contextWindow > 0 ? (
        <span
          className="hidden font-mono text-[10px] tabular-nums sm:inline"
          title="Context window occupancy"
        >
          {Math.round((usage.contextTokens / usage.contextWindow) * 100)}% ctx
        </span>
      ) : null}
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
        onClick={onOpenActivity}
        aria-label="Open agents activity"
        title="Subagents, background tasks, teammates"
      >
        <Activity data-icon="inline-start" />
        {agentCount > 0 ? String(agentCount) : "Agents"}
      </Button>
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

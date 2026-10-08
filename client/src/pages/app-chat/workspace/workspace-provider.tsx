import { type ReactNode } from "react";
import type { AppId } from "@/shared/schemas";
import { useWorkspaceController } from "./use-workspace-controller";
import { WorkspaceContext } from "./workspace-context";

export type WorkspaceProviderProps = {
  readonly appId: AppId;
  readonly enabled: boolean;
  readonly agentRunning: boolean;
  readonly filesRevision: number;
  readonly children: ReactNode;
};

/**
 * Owns the unified WebContainer workspace controller and exposes it through
 * context. Mount this once around the panel and any left-column consumers that
 * need the selected element, preview error, or resync controls.
 */
export function WorkspaceProvider({
  appId,
  enabled,
  agentRunning,
  filesRevision,
  children,
}: WorkspaceProviderProps): ReactNode {
  const controller = useWorkspaceController({
    appId,
    enabled,
    agentRunning,
    filesRevision,
  });
  return (
    <WorkspaceContext.Provider value={controller}>
      {children}
    </WorkspaceContext.Provider>
  );
}

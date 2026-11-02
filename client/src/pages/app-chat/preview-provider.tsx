import { type ReactNode } from "react";
import type { AppId } from "@/shared/schemas";
import { PreviewContext } from "./preview-context";
import { usePreviewController } from "./use-preview-controller";

export type PreviewProviderProps = {
  readonly appId: AppId;
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly agentRunning: boolean;
  readonly filesRevision: number;
  readonly children: ReactNode;
};

export function PreviewProvider({
  appId,
  enabled,
  canEdit,
  agentRunning,
  filesRevision,
  children,
}: PreviewProviderProps): ReactNode {
  const controller = usePreviewController({
    appId,
    enabled,
    canEdit,
    agentRunning,
    filesRevision,
  });
  return (
    <PreviewContext.Provider value={controller}>
      {children}
    </PreviewContext.Provider>
  );
}

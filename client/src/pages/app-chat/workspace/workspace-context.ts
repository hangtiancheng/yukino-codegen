import { createContext, useContext } from "react";
import type { WorkspaceController } from "./workspace-types";

export const WorkspaceContext = createContext<WorkspaceController | null>(null);

/** Access the unified workspace controller provided by `WorkspaceProvider`. */
export function useWorkspace(): WorkspaceController {
  const controller = useContext(WorkspaceContext);
  if (controller === null) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return controller;
}

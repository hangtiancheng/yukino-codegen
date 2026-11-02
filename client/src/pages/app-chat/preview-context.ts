import { createContext, useContext } from "react";
import type { PreviewController } from "./use-preview-controller";

export const PreviewContext = createContext<PreviewController | null>(null);

export function usePreview(): PreviewController {
  const controller = useContext(PreviewContext);
  if (controller === null) {
    throw new Error("usePreview must be used within a PreviewProvider");
  }
  return controller;
}

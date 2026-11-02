import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AppId, VisualEditorElementInfo } from "@/shared/schemas";
import type { PreviewRuntimeError } from "./build-error-context";
import { fetchPreviewState } from "./preview-api";
import type { PreviewStatus } from "./preview-status";
import { usePreviewErrors } from "./use-preview-errors";
import { useVisualEditor } from "./use-visual-editor";

export type PreviewControllerOptions = {
  readonly appId: AppId;
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly agentRunning: boolean;
  readonly filesRevision: number;
};

export type PreviewController = {
  readonly previewUrl: string | undefined;
  readonly status: PreviewStatus;
  readonly error: string | undefined;
  readonly logs: string;
  readonly reloadPreview: () => void;
  readonly clearError: () => void;
  readonly resync: () => void;

  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly editMode: boolean;
  readonly selectedElement: VisualEditorElementInfo | undefined;
  readonly toggleEditMode: () => void;
  readonly clearSelection: () => void;
  readonly handleIframeLoad: () => void;

  readonly previewError: PreviewRuntimeError | undefined;
  readonly clearPreviewError: () => void;

  readonly agentRunning: boolean;
  readonly canEdit: boolean;
};

export function usePreviewController({
  appId,
  enabled,
  canEdit,
  agentRunning,
  filesRevision,
}: PreviewControllerOptions): PreviewController {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [logs, setLogs] = useState("");
  const [error, setError] = useState<string>();
  const [buildError, setBuildError] = useState<PreviewRuntimeError>();
  const aliveRef = useRef(true);
  const previewAbort = useRef<AbortController | undefined>(undefined);
  const previewTask = useRef<Promise<void> | undefined>(undefined);
  const rebuildPending = useRef(false);
  const runningRef = useRef(agentRunning);
  runningRef.current = agentRunning;
  const visualEditor = useVisualEditor(previewUrl);
  const previewErrors = usePreviewErrors(visualEditor.iframeRef, previewUrl);

  const rebuild = useCallback((): void => {
    if (!aliveRef.current) return;
    if (runningRef.current || previewTask.current !== undefined) {
      rebuildPending.current = true;
      return;
    }
    const abort = new AbortController();
    previewAbort.current = abort;
    setError(undefined);
    setBuildError(undefined);
    setStatus("installing");
    const task = (async () => {
      do {
        rebuildPending.current = false;
        let state = await fetchPreviewState(appId, true, abort.signal);
        for (;;) {
          if (abort.signal.aborted || !aliveRef.current) return;
          setStatus(state.status);
          setLogs(state.logs);
          setError(state.error);
          if (state.status === "failed")
            setBuildError({
              message: `${state.error ?? "Build failed"}\n${state.logs}`,
            });
          if (state.url !== undefined)
            setPreviewUrl(`${state.url}?v=${state.revision}`);
          if (state.status !== "installing" && state.status !== "building")
            break;
          await new Promise<void>((resolve) => {
            const onAbort = () => {
              clearTimeout(timer);
              resolve();
            };
            const timer = setTimeout(() => {
              abort.signal.removeEventListener("abort", onAbort);
              resolve();
            }, 750);
            abort.signal.addEventListener("abort", onAbort, { once: true });
          });
          abort.signal.throwIfAborted();
          state = await fetchPreviewState(appId, false, abort.signal);
        }
      } while (
        rebuildPending.current &&
        !runningRef.current &&
        !abort.signal.aborted
      );
    })()
      .catch((cause: unknown) => {
        if (abort.signal.aborted || !aliveRef.current) return;
        setStatus("failed");
        setError(cause instanceof Error ? cause.message : "Build failed");
        setBuildError({
          message: cause instanceof Error ? cause.message : "Build failed",
        });
      })
      .finally(() => {
        if (previewTask.current === task) previewTask.current = undefined;
      });
    previewTask.current = task;
  }, [appId]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      previewAbort.current?.abort();
      previewTask.current = undefined;
    };
  }, [appId]);

  useEffect(() => {
    if (!enabled) return;
    rebuild();
  }, [enabled, rebuild]);

  const previousRun = useRef(agentRunning);
  const previousRevision = useRef(filesRevision);
  useEffect(() => {
    const finished = previousRun.current && !agentRunning;
    const changed = previousRevision.current !== filesRevision;
    previousRun.current = agentRunning;
    previousRevision.current = filesRevision;
    if (enabled && (finished || changed) && !agentRunning) rebuild();
  }, [agentRunning, enabled, filesRevision, rebuild]);

  return {
    previewUrl,
    status,
    error,
    logs,
    reloadPreview: rebuild,
    clearError: () => setError(undefined),
    resync: rebuild,
    iframeRef: visualEditor.iframeRef,
    editMode: visualEditor.editMode,
    selectedElement: visualEditor.selectedElement,
    toggleEditMode: visualEditor.toggleEditMode,
    clearSelection: visualEditor.clearSelection,
    handleIframeLoad: visualEditor.handleIframeLoad,
    previewError: previewErrors.latest ?? buildError,
    clearPreviewError: () => {
      previewErrors.clear();
      setBuildError(undefined);
    },
    agentRunning,
    canEdit,
  };
}

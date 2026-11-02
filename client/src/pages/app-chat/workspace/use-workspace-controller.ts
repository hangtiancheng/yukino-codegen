import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentFileMutationResponse, AppId } from "@/shared/schemas";
import type { PreviewStatus } from "../preview-status";
import type { PreviewRuntimeError } from "../build-error-context";
import { usePreviewErrors } from "../use-preview-errors";
import { useVisualEditor } from "../use-visual-editor";
import {
  createWorkspaceDirectory,
  deleteWorkspacePath,
  fetchWorkspaceTree,
  isSaveConflict,
  renameWorkspacePath,
  saveWorkspaceFile,
} from "./agent-files-api";
import { connectTerminal, fetchPreviewState } from "./server-workspace-api";
import { hashContents, joinPath, normalizePath } from "./workspace-paths";
import {
  reconcileSavedFile,
  snapshotFromAgentTree,
  threeWayMerge,
  type WorkspaceNode,
} from "./workspace-tree";
import type {
  TerminalSurface,
  WorkspaceController,
  WorkspaceFileState,
} from "./workspace-types";

export type WorkspaceControllerOptions = {
  readonly appId: AppId;
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly agentRunning: boolean;
  readonly filesRevision: number;
};
function assertMutation(response: AgentFileMutationResponse): void {
  if (response.status === "conflict")
    throw new Error(`Workspace file conflict: ${response.conflict.path}`);
}
const isUnder = (path: string, parent: string): boolean =>
  path === parent || path.startsWith(`${parent}/`);
const remap = (path: string, from: string, to: string): string =>
  isUnder(path, from) ? to + path.slice(from.length) : path;
const isDirectory = (nodes: readonly WorkspaceNode[], path: string): boolean =>
  nodes.some(
    (node) =>
      node.kind === "directory" &&
      (node.path === path || isDirectory(node.children, path)),
  );

export function useWorkspaceController({
  appId,
  enabled,
  canEdit,
  agentRunning,
  filesRevision,
}: WorkspaceControllerOptions): WorkspaceController {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [logs, setLogs] = useState("");
  const [error, setError] = useState<string>();
  const [buildError, setBuildError] = useState<PreviewRuntimeError>();
  const [tree, setTree] = useState<readonly WorkspaceNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [openPaths, setOpenPaths] = useState<readonly string[]>([]);
  const [activePath, setActivePathState] = useState<string>();
  const [files, setFiles] = useState<ReadonlyMap<string, WorkspaceFileState>>(
    new Map(),
  );
  const [busy, setBusy] = useState(false);
  const filesRef = useRef(files);
  const snapshotRef = useRef<ReturnType<typeof snapshotFromAgentTree>>({
    nodes: [],
    files: new Map(),
  });
  const aliveRef = useRef(true);
  const treeSequence = useRef(0);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const previewAbort = useRef<AbortController | undefined>(undefined);
  const previewTask = useRef<Promise<void> | undefined>(undefined);
  const rebuildPending = useRef(false);
  const runningRef = useRef(agentRunning);
  runningRef.current = agentRunning;
  const visualEditor = useVisualEditor(previewUrl);
  const previewErrors = usePreviewErrors(visualEditor.iframeRef, previewUrl);

  const putFile = useCallback(
    (
      path: string,
      update: (file: WorkspaceFileState | undefined) => WorkspaceFileState,
    ): void => {
      const next = new Map(filesRef.current);
      next.set(path, update(next.get(path)));
      filesRef.current = next;
      setFiles(next);
    },
    [],
  );

  const syncTree = useCallback(async (): Promise<void> => {
    const sequence = ++treeSequence.current;
    const snapshot = snapshotFromAgentTree(await fetchWorkspaceTree(appId));
    if (!aliveRef.current || sequence !== treeSequence.current) return;
    snapshotRef.current = snapshot;
    setTree(snapshot.nodes);
    const next = new Map(filesRef.current);
    for (const [path, current] of next) {
      const server = snapshot.files.get(path);
      if (server?.hash === current.serverHash) continue;
      if (server === undefined) {
        if (current.dirty)
          next.set(path, {
            ...current,
            serverHash: null,
            conflict: {
              path,
              base: current.baseText,
              local: current.contents,
              server: "",
            },
          });
        else {
          next.delete(path);
          setOpenPaths((paths) => paths.filter((item) => item !== path));
          setActivePathState((active) =>
            active === path ? undefined : active,
          );
        }
        continue;
      }
      const serverText = server.text ?? "";
      const merged = current.dirty
        ? threeWayMerge(current.baseText, current.contents, serverText)
        : { clean: true as const, text: serverText };
      if (!merged.clean)
        next.set(path, {
          ...current,
          serverHash: server.hash,
          conflict: {
            path,
            base: current.baseText,
            local: current.contents,
            server: serverText,
          },
        });
      else
        next.set(path, {
          ...current,
          binary: server.binary,
          contents: merged.text,
          baseText: serverText,
          baseHash: hashContents(serverText),
          serverHash: server.hash,
          dirty: merged.text !== serverText,
          revision: current.revision + 1,
          conflict: undefined,
        });
    }
    filesRef.current = next;
    setFiles(next);
  }, [appId]);

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

  const resyncAfterAgent = useCallback((): void => {
    void syncTree()
      .then(() => {
        if (!runningRef.current) rebuild();
      })
      .catch((cause: unknown) => {
        if (aliveRef.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Workspace synchronization failed",
          );
      });
  }, [syncTree, rebuild]);

  const enqueue = useCallback(
    (operation: () => Promise<void>): Promise<void> => {
      const task = mutationQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!canEdit || runningRef.current)
            throw new Error("Workspace is currently read-only");
          if (!aliveRef.current) return;
          setBusy(true);
          treeSequence.current += 1;
          try {
            await operation();
          } finally {
            if (aliveRef.current) setBusy(false);
          }
        });
      mutationQueue.current = task;
      return task;
    },
    [canEdit],
  );

  const openFile = useCallback(
    (raw: string): void => {
      const path = normalizePath(raw);
      const server = snapshotRef.current.files.get(path);
      if (server === undefined) return;
      if (!filesRef.current.has(path)) {
        const text = server.text ?? "";
        putFile(path, () => ({
          path,
          binary: server.binary,
          contents: text,
          baseText: text,
          baseHash: hashContents(text),
          serverHash: server.hash,
          dirty: false,
          revision: 1,
          conflict: undefined,
        }));
      }
      setOpenPaths((paths) =>
        paths.includes(path) ? paths : [...paths, path],
      );
      setActivePathState(path);
    },
    [putFile],
  );

  const saveFile = useCallback(
    (path: string): Promise<void> =>
      enqueue(async () => {
        const attempted = filesRef.current.get(path);
        if (attempted === undefined || attempted.binary || !attempted.dirty)
          return;
        if (attempted.conflict !== undefined)
          throw new Error(`Resolve the conflict in ${path} before saving`);
        const result = await saveWorkspaceFile(appId, {
          path,
          contents: attempted.contents,
          encoding: "utf8",
          expectedHash: attempted.serverHash,
        });
        if (isSaveConflict(result)) {
          putFile(path, (latest) => ({
            ...(latest ?? attempted),
            serverHash: result.serverHash,
            conflict: {
              path,
              base: attempted.baseText,
              local: (latest ?? attempted).contents,
              server: result.serverContents,
            },
          }));
          throw new Error(`Workspace file conflict: ${path}`);
        }
        putFile(path, (latest) =>
          reconcileSavedFile(attempted, latest ?? attempted, result.hash),
        );
        rebuild();
      }),
    [appId, enqueue, putFile, rebuild],
  );

  const saveAll = useCallback(async (): Promise<void> => {
    for (const [path, file] of filesRef.current)
      if (file.dirty && !file.binary) await saveFile(path);
  }, [saveFile]);

  const createFile = useCallback(
    (parent: string, name: string) =>
      enqueue(async () => {
        const path = joinPath(parent, name);
        const result = await saveWorkspaceFile(appId, {
          path,
          contents: "",
          encoding: "utf8",
          expectedHash: null,
        });
        if (isSaveConflict(result))
          throw new Error(`File already exists: ${path}`);
        await syncTree();
        openFile(path);
        rebuild();
      }),
    [appId, enqueue, syncTree, openFile, rebuild],
  );

  const createDirectory = useCallback(
    (parent: string, name: string) =>
      enqueue(async () => {
        assertMutation(
          await createWorkspaceDirectory(appId, joinPath(parent, name)),
        );
        await syncTree();
      }),
    [appId, enqueue, syncTree],
  );

  const renamePath = useCallback(
    (from: string, to: string) =>
      enqueue(async () => {
        assertMutation(
          await renameWorkspacePath(
            appId,
            from,
            to,
            snapshotRef.current.files.get(from)?.hash,
          ),
        );
        const next = new Map<string, WorkspaceFileState>();
        for (const [path, file] of filesRef.current) {
          const mapped = remap(path, from, to);
          next.set(mapped, {
            ...file,
            path: mapped,
            conflict:
              file.conflict === undefined
                ? undefined
                : { ...file.conflict, path: mapped },
          });
        }
        filesRef.current = next;
        setFiles(next);
        setOpenPaths((paths) => paths.map((path) => remap(path, from, to)));
        setActivePathState((path) =>
          path === undefined ? undefined : remap(path, from, to),
        );
        await syncTree();
        rebuild();
      }),
    [appId, enqueue, syncTree, rebuild],
  );

  const deletePath = useCallback(
    (path: string) =>
      enqueue(async () => {
        assertMutation(
          await deleteWorkspacePath(
            appId,
            path,
            snapshotRef.current.files.get(path)?.hash,
            isDirectory(snapshotRef.current.nodes, path),
          ),
        );
        const next = new Map(filesRef.current);
        for (const key of next.keys()) if (isUnder(key, path)) next.delete(key);
        filesRef.current = next;
        setFiles(next);
        setOpenPaths((paths) => paths.filter((item) => !isUnder(item, path)));
        setActivePathState((active) =>
          active !== undefined && isUnder(active, path) ? undefined : active,
        );
        await syncTree();
        rebuild();
      }),
    [appId, enqueue, syncTree, rebuild],
  );

  const acceptAgentChanges = useCallback(
    (path: string) =>
      enqueue(async () => {
        const file = filesRef.current.get(path);
        if (file?.conflict === undefined) return;
        if (file.serverHash === null) {
          const next = new Map(filesRef.current);
          next.delete(path);
          filesRef.current = next;
          setFiles(next);
          setOpenPaths((paths) => paths.filter((item) => item !== path));
          setActivePathState((active) =>
            active === path ? undefined : active,
          );
        } else {
          const text = file.conflict.server;
          putFile(path, () => ({
            ...file,
            contents: text,
            baseText: text,
            baseHash: hashContents(text),
            dirty: false,
            revision: file.revision + 1,
            conflict: undefined,
          }));
        }
        await syncTree();
      }),
    [enqueue, syncTree, putFile],
  );

  const keepLocalChanges = useCallback(
    (path: string, contents?: string) =>
      enqueue(async () => {
        const file = filesRef.current.get(path);
        if (file?.conflict === undefined) return;
        const text = contents ?? file.contents;
        const result = await saveWorkspaceFile(appId, {
          path,
          contents: text,
          encoding: "utf8",
          expectedHash: file.serverHash,
        });
        if (isSaveConflict(result)) {
          putFile(path, (latest) => ({
            ...(latest ?? file),
            serverHash: result.serverHash,
            dirty: true,
            conflict: {
              path,
              base: file.conflict?.server ?? "",
              local: text,
              server: result.serverContents,
            },
          }));
          throw new Error(`Workspace file conflict: ${path}`);
        }
        const attempted = { ...file, contents: text };
        putFile(path, (latest) => ({
          ...reconcileSavedFile(
            attempted,
            latest?.contents === file.contents
              ? attempted
              : (latest ?? attempted),
            result.hash,
          ),
          revision: (latest ?? file).revision + 1,
        }));
        await syncTree();
        rebuild();
      }),
    [appId, enqueue, syncTree, rebuild, putFile],
  );

  const refreshTree = useCallback((): void => {
    void syncTree().catch((cause: unknown) => {
      if (aliveRef.current)
        setError(
          cause instanceof Error ? cause.message : "Unable to load files",
        );
    });
  }, [syncTree]);
  const reloadPreview = useCallback((): void => {
    rebuild();
  }, [rebuild]);
  const attachTerminal = useCallback(
    (surface: TerminalSurface) => connectTerminal(appId, surface),
    [appId],
  );
  const flushTerminalSync = useCallback(async (): Promise<void> => {
    await mutationQueue.current;
    await syncTree();
  }, [syncTree]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      treeSequence.current += 1;
      previewAbort.current?.abort();
      previewTask.current = undefined;
    };
  }, [appId]);
  useEffect(() => {
    if (!enabled) return;
    setTreeLoading(true);
    void syncTree()
      .then(() => {
        if (aliveRef.current && !runningRef.current) rebuild();
      })
      .catch((cause: unknown) => {
        if (aliveRef.current)
          setError(
            cause instanceof Error ? cause.message : "Unable to load files",
          );
      })
      .finally(() => {
        if (aliveRef.current) setTreeLoading(false);
      });
  }, [enabled, syncTree, rebuild]);

  const previousRun = useRef(agentRunning);
  const previousRevision = useRef(filesRevision);
  useEffect(() => {
    const finished = previousRun.current && !agentRunning;
    const changed = previousRevision.current !== filesRevision;
    previousRun.current = agentRunning;
    previousRevision.current = filesRevision;
    if (enabled && (finished || changed)) {
      if (agentRunning) refreshTree();
      else resyncAfterAgent();
    }
  }, [agentRunning, enabled, filesRevision, refreshTree, resyncAfterAgent]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (!runningRef.current && !busy) refreshTree();
    }, 4000);
    return () => clearInterval(timer);
  }, [enabled, busy, refreshTree]);

  return {
    previewUrl,
    status,
    error,
    logs,
    reloadPreview,
    clearError: () => setError(undefined),
    resync: resyncAfterAgent,
    resyncAfterAgent,
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
    tree,
    treeLoading,
    refreshTree,
    openPaths,
    activePath,
    openFile,
    closeFile: (path) => {
      setOpenPaths((paths) => {
        const next = paths.filter((item) => item !== path);
        setActivePathState((active) =>
          active === path ? next.at(-1) : active,
        );
        return next;
      });
    },
    setActivePath: setActivePathState,
    getFileState: (path) => files.get(path),
    updateFileContents: (path, contents) => {
      if (!canEdit || runningRef.current) return;
      putFile(path, (file) => {
        if (file === undefined) throw new Error(`File not loaded: ${path}`);
        return { ...file, contents, dirty: contents !== file.baseText };
      });
    },
    saveFile,
    saveAll,
    createFile,
    createDirectory,
    renamePath,
    deletePath,
    acceptAgentChanges,
    keepLocalChanges,
    attachTerminal,
    flushTerminalSync,
    agentRunning,
    canEdit,
    busy,
  };
}

import type { IFSWatcher, WebContainer } from "@webcontainer/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWebContainer } from "@/shared/webcontainer";
import type { AgentFileMutationResponse, AppId } from "@/shared/schemas";
import type { PreviewStatus } from "../preview-status";
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
import { startShellSession } from "./webcontainer-terminal";
import {
  clampLog,
  getActivePreviewUrl,
  queueFsTask,
  reloadPreviewIframe,
  startPreview,
  stopPreview,
  type PreviewCallbacks,
} from "./webcontainer-runtime";
import {
  base64ToBytes,
  bytesToBase64,
  createContainerDirectory,
  isUtf8Bytes,
  readContainerPath,
  readContainerText,
  removeContainerPath,
  renameContainerPath,
  walkContainerTree,
  writeContainerBytes,
  writeContainerText,
} from "./webcontainer-fs";
import {
  hashContents,
  isBinaryPath,
  isIgnoredPath,
  joinPath,
  normalizePath,
} from "./workspace-paths";
import {
  agentTreeToFileSystem,
  dependencyFilesChanged,
  reconcileSavedFile,
  snapshotFromAgentTree,
  threeWayMerge,
  type WorkspaceFileContent,
  type WorkspaceNode,
} from "./workspace-tree";
import type {
  TerminalHandle,
  TerminalSurface,
  WorkspaceController,
  WorkspaceFileState,
} from "./workspace-types";

const SYNC_DEBOUNCE_MS = 250;
const decoder = new TextDecoder();

export type WorkspaceControllerOptions = {
  readonly appId: AppId;
  readonly enabled: boolean;
  readonly agentRunning: boolean;
  readonly filesRevision: number;
};

class WorkspaceSyncConflictError extends Error {
  constructor(path: string) {
    super(`Workspace file conflict: ${path}`);
    this.name = "WorkspaceSyncConflictError";
  }
}

function assertMutationSucceeded(response: AgentFileMutationResponse): void {
  if (response.status === "conflict") {
    throw new WorkspaceSyncConflictError(response.conflict.path);
  }
}

function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return path;
}

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

function isDirectoryPath(
  nodes: readonly WorkspaceNode[],
  path: string,
): boolean {
  for (const node of nodes) {
    if (node.path === path) return node.kind === "directory";
    if (node.kind === "directory" && isDirectoryPath(node.children, path)) {
      return true;
    }
  }
  return false;
}

async function writeServerFile(
  container: WebContainer,
  path: string,
  file: WorkspaceFileContent,
): Promise<void> {
  if (file.encoding === "base64") {
    await writeContainerBytes(container, path, base64ToBytes(file.contents));
  } else {
    await writeContainerText(container, path, file.contents);
  }
}

export function useWorkspaceController(
  options: WorkspaceControllerOptions,
): WorkspaceController {
  const { appId, enabled, agentRunning, filesRevision } = options;

  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [logs, setLogs] = useState("");
  const [error, setError] = useState<string>();
  const [tree, setTree] = useState<readonly WorkspaceNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [openPaths, setOpenPaths] = useState<readonly string[]>([]);
  const [activePath, setActivePathState] = useState<string>();
  const [files, setFiles] = useState<ReadonlyMap<string, WorkspaceFileState>>(
    new Map(),
  );
  const [busyCount, setBusyCount] = useState(0);

  const aliveRef = useRef(true);
  const versionRef = useRef(0);
  const filesRef = useRef<ReadonlyMap<string, WorkspaceFileState>>(files);
  const serverSnapshotRef = useRef<Map<string, WorkspaceFileContent>>(
    new Map(),
  );
  const suppressRef = useRef<Set<string>>(new Set());
  const watcherRef = useRef<IFSWatcher | undefined>(undefined);
  const changedPathsRef = useRef<Map<string, number>>(new Map());
  const changedPathSequenceRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const terminalSyncChainRef = useRef<Promise<void>>(Promise.resolve());
  const agentRunningRef = useRef(agentRunning);
  const prevAgentRunningRef = useRef(agentRunning);
  const runHadFilesRevisionRef = useRef(false);
  const handledFilesRevisionRef = useRef(filesRevision);

  const visualEditor = useVisualEditor(previewUrl);
  const previewErrors = usePreviewErrors();
  const { iframeRef } = visualEditor;

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const isCurrent = useCallback(
    (version: number): boolean =>
      aliveRef.current && version === versionRef.current,
    [],
  );

  const putFile = useCallback(
    (
      path: string,
      build: (prev: WorkspaceFileState | undefined) => WorkspaceFileState,
    ): void => {
      const current = filesRef.current;
      const next = new Map(current);
      next.set(path, build(current.get(path)));
      filesRef.current = next;
      setFiles(next);
    },
    [],
  );

  // Replace a buffer from an authoritative external source (open, agent sync,
  // conflict resolution). Bumps revision so the editor resets its model.
  const applyExternalContents = useCallback(
    (
      path: string,
      contents: string,
      serverText: string,
      serverHash: string | null,
    ): void => {
      putFile(path, (prev) => ({
        path,
        binary: false,
        contents,
        baseText: serverText,
        baseHash: hashContents(serverText),
        serverHash,
        dirty: hashContents(contents) !== hashContents(serverText),
        revision: (prev?.revision ?? 0) + 1,
        conflict: undefined,
      }));
    },
    [putFile],
  );

  const flushChangedNow = useCallback((): Promise<void> => {
    if (debounceTimerRef.current !== undefined) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = undefined;
    }
    const paths = [...changedPathsRef.current.entries()];
    if (paths.length === 0) return Promise.resolve();

    const task = terminalSyncChainRef.current
      .catch(() => undefined)
      .then(() =>
        queueFsTask(async () => {
          const container = await getWebContainer();
          for (const [path, sequence] of paths) {
            const entry = await readContainerPath(container, path);
            const base = serverSnapshotRef.current.get(path);

            if (entry.kind === "missing") {
              const response = await deleteWorkspacePath(
                appId,
                path,
                base?.hash,
                true,
              );
              assertMutationSucceeded(response);
              serverSnapshotRef.current.delete(path);
              setFiles((prev) => {
                if (!prev.has(path)) return prev;
                const next = new Map(prev);
                next.delete(path);
                filesRef.current = next;
                return next;
              });
              setOpenPaths((prev) => prev.filter((item) => item !== path));
              setActivePathState((prev) => (prev === path ? undefined : prev));
            } else if (entry.kind === "directory") {
              const response = await createWorkspaceDirectory(appId, path);
              assertMutationSucceeded(response);
            } else {
              const binary =
                base?.binary === true ||
                isBinaryPath(path) ||
                !isUtf8Bytes(entry.contents);
              const contents = binary
                ? bytesToBase64(entry.contents)
                : decoder.decode(entry.contents);
              const encoding = binary ? "base64" : "utf8";
              const result = await saveWorkspaceFile(appId, {
                path,
                contents,
                encoding,
                expectedHash: base?.hash ?? null,
              });
              if (isSaveConflict(result)) {
                const current = filesRef.current.get(path);
                if (!binary && current !== undefined && !current.binary) {
                  putFile(path, (latest) => ({
                    ...(latest ?? current),
                    serverHash: result.serverHash,
                    dirty: true,
                    conflict: {
                      path,
                      base: current.baseText,
                      local: (latest ?? current).contents,
                      server: result.serverContents,
                    },
                  }));
                }
                throw new WorkspaceSyncConflictError(path);
              }

              serverSnapshotRef.current.set(path, {
                binary,
                encoding,
                contents,
                text: binary ? undefined : contents,
                hash: result.hash,
              });
              const open = filesRef.current.get(path);
              if (open !== undefined && !open.binary && !binary) {
                if (open.dirty && open.contents !== contents) {
                  putFile(path, (latest) => {
                    const current = latest ?? open;
                    return {
                      ...current,
                      baseText: contents,
                      baseHash: hashContents(contents),
                      serverHash: result.hash,
                      dirty: current.contents !== contents,
                      conflict: {
                        path,
                        base: open.baseText,
                        local: current.contents,
                        server: contents,
                      },
                    };
                  });
                } else {
                  applyExternalContents(path, contents, contents, result.hash);
                }
              }
            }

            if (changedPathsRef.current.get(path) === sequence) {
              changedPathsRef.current.delete(path);
            }
          }
          try {
            setTree(await walkContainerTree(container));
          } catch {
            // File persistence succeeded; the next refresh can rebuild the tree.
          }
        }),
      );
    terminalSyncChainRef.current = task;
    return task;
  }, [appId, applyExternalContents, putFile]);

  const scheduleTerminalSync = useCallback(
    (path: string): void => {
      if (agentRunningRef.current) return;
      changedPathSequenceRef.current += 1;
      changedPathsRef.current.set(path, changedPathSequenceRef.current);
      if (debounceTimerRef.current !== undefined) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void flushChangedNow().catch((cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Terminal changes failed to synchronize",
          );
        });
      }, SYNC_DEBOUNCE_MS);
    },
    [flushChangedNow],
  );

  const startWatcher = useCallback(
    (container: WebContainer): void => {
      watcherRef.current?.close();
      watcherRef.current = container.fs.watch(
        ".",
        { recursive: true },
        (_event, filename) => {
          const raw =
            typeof filename === "string" ? filename : decoder.decode(filename);
          const path = normalizePath(raw);
          if (path === "" || isIgnoredPath(path)) return;
          if (suppressRef.current.has(path)) {
            suppressRef.current.delete(path);
            return;
          }
          scheduleTerminalSync(path);
        },
      );
    },
    [scheduleTerminalSync],
  );

  const makePreviewCallbacks = useCallback(
    (version: number): PreviewCallbacks => ({
      onStatus: (next) => {
        if (isCurrent(version)) setStatus(next);
      },
      onLog: (chunk) => {
        if (isCurrent(version)) setLogs((current) => clampLog(current, chunk));
      },
      onReady: (url) => {
        if (isCurrent(version)) setPreviewUrl(url);
      },
      onError: (message) => {
        if (isCurrent(version)) {
          setPreviewUrl(undefined);
          setError(message);
        }
      },
      isCurrent: () => isCurrent(version),
    }),
    [isCurrent],
  );

  const boot = useCallback((): void => {
    const version = ++versionRef.current;
    setError(undefined);
    setLogs("");
    setTreeLoading(true);
    void (async () => {
      try {
        const root = await fetchWorkspaceTree(appId);
        if (!isCurrent(version)) return;
        watcherRef.current?.close();
        watcherRef.current = undefined;
        const snapshot = snapshotFromAgentTree(root);
        serverSnapshotRef.current = new Map(snapshot.files);
        setTree(snapshot.nodes);
        setTreeLoading(false);
        // A freshly created app has no files yet. Booting a WebContainer and
        // running `npm install` against an empty tree fails with ENOENT, so stay
        // idle instead. Once the agent scaffolds a package.json, resyncAfterAgent
        // detects the dependency change and boots the preview.
        if (!snapshot.files.has("package.json")) {
          setStatus("idle");
          return;
        }
        await startPreview(
          appId,
          agentTreeToFileSystem(root),
          makePreviewCallbacks(version),
        );
        if (!isCurrent(version)) return;
        const container = await getWebContainer();
        setTree(await walkContainerTree(container));
        startWatcher(container);
      } catch (cause) {
        if (!isCurrent(version)) return;
        setTreeLoading(false);
        setError(
          cause instanceof Error ? cause.message : "Preview failed to start",
        );
        setStatus("failed");
      }
    })();
  }, [appId, isCurrent, makePreviewCallbacks, startWatcher]);

  const resyncAfterAgent = useCallback((): void => {
    const version = versionRef.current;
    void (async () => {
      let watcherPaused = false;
      try {
        const root = await fetchWorkspaceTree(appId);
        if (!isCurrent(version)) return;
        const newServer = snapshotFromAgentTree(root).files;
        const prevServer = serverSnapshotRef.current;
        const dependenciesChanged = dependencyFilesChanged(
          prevServer,
          newServer,
        );
        if (dependenciesChanged) {
          watcherRef.current?.close();
          watcherRef.current = undefined;
          watcherPaused = true;
          await startPreview(
            appId,
            agentTreeToFileSystem(root),
            makePreviewCallbacks(version),
          );
          if (!isCurrent(version)) return;
        }

        await queueFsTask(async () => {
          const container = await getWebContainer();
          for (const [path, server] of newServer) {
            const previous = prevServer.get(path);
            const buffer = filesRef.current.get(path);
            if (server.binary) {
              if (previous?.hash !== server.hash) {
                suppressRef.current.add(path);
                await writeServerFile(container, path, server);
                if (buffer?.binary === true) {
                  putFile(path, (current) => ({
                    ...(current ?? buffer),
                    serverHash: server.hash,
                    dirty: false,
                    revision: (current ?? buffer).revision + 1,
                    conflict: undefined,
                  }));
                }
              }
              continue;
            }

            const serverText = server.text ?? server.contents;
            if (buffer !== undefined && buffer.dirty && !buffer.binary) {
              const current = filesRef.current.get(path) ?? buffer;
              const merged = threeWayMerge(
                current.baseText,
                current.contents,
                serverText,
              );
              suppressRef.current.add(path);
              if (merged.clean) {
                await writeContainerText(container, path, merged.text);
                applyExternalContents(
                  path,
                  merged.text,
                  serverText,
                  server.hash,
                );
              } else {
                await writeContainerText(container, path, serverText);
                putFile(path, (latest) => {
                  const local = latest ?? current;
                  return {
                    ...local,
                    serverHash: server.hash,
                    dirty: true,
                    conflict: {
                      path,
                      base: current.baseText,
                      local: local.contents,
                      server: serverText,
                    },
                  };
                });
              }
              continue;
            }

            if (previous?.hash !== server.hash) {
              suppressRef.current.add(path);
              await writeContainerText(container, path, serverText);
              if (buffer !== undefined && !buffer.binary) {
                applyExternalContents(
                  path,
                  serverText,
                  serverText,
                  server.hash,
                );
              }
            }
          }

          for (const [path] of prevServer) {
            if (newServer.has(path)) continue;
            const buffer = filesRef.current.get(path);
            if (buffer?.dirty === true && !buffer.binary) {
              putFile(path, (latest) => {
                const local = latest ?? buffer;
                return {
                  ...local,
                  serverHash: null,
                  dirty: true,
                  conflict: {
                    path,
                    base: buffer.baseText,
                    local: local.contents,
                    server: "",
                  },
                };
              });
              continue;
            }
            suppressRef.current.add(path);
            await removeContainerPath(container, path);
            setFiles((prevMap) => {
              if (!prevMap.has(path)) return prevMap;
              const nextMap = new Map(prevMap);
              nextMap.delete(path);
              filesRef.current = nextMap;
              return nextMap;
            });
            setOpenPaths((prevPaths) =>
              prevPaths.filter((item) => item !== path),
            );
            setActivePathState((current) =>
              current === path ? undefined : current,
            );
          }
          serverSnapshotRef.current = new Map(newServer);
          setTree(await walkContainerTree(container));
        });
        if (!isCurrent(version)) return;
        if (dependenciesChanged) {
          startWatcher(await getWebContainer());
          watcherPaused = false;
        }
        reloadPreviewIframe(iframeRef.current);
      } catch (cause) {
        if (!isCurrent(version)) return;
        if (watcherPaused) {
          try {
            startWatcher(await getWebContainer());
          } catch {
            // The workspace is unavailable; boot/resync will attach a new watcher.
          }
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Workspace failed to synchronize",
        );
      }
    })();
  }, [
    appId,
    applyExternalContents,
    iframeRef,
    isCurrent,
    makePreviewCallbacks,
    putFile,
    startWatcher,
  ]);

  const refreshTree = useCallback((): void => {
    void (async () => {
      try {
        const container = await getWebContainer();
        setTree(await walkContainerTree(container));
      } catch {
        // Ignore: the container is not ready yet.
      }
    })();
  }, []);

  const openFile = useCallback(
    (path: string): void => {
      const normalized = normalizePath(path);
      setOpenPaths((prev) =>
        prev.includes(normalized) ? prev : [...prev, normalized],
      );
      setActivePathState(normalized);
      const known = serverSnapshotRef.current.get(normalized);
      if (known?.binary === true || isBinaryPath(normalized)) {
        putFile(normalized, (prev) => ({
          path: normalized,
          binary: true,
          contents: "",
          baseText: "",
          baseHash: hashContents(""),
          serverHash: known?.hash ?? null,
          dirty: false,
          revision: (prev?.revision ?? 0) + 1,
          conflict: undefined,
        }));
        return;
      }
      if (filesRef.current.has(normalized)) return;
      void (async () => {
        try {
          const container = await getWebContainer();
          const text = await readContainerText(container, normalized);
          const known = serverSnapshotRef.current.get(normalized);
          const serverText = known?.text ?? text;
          applyExternalContents(
            normalized,
            text,
            serverText,
            known?.hash ?? null,
          );
        } catch {
          // File vanished before it could be opened.
        }
      })();
    },
    [applyExternalContents, putFile],
  );

  const closeFile = useCallback((path: string): void => {
    const normalized = normalizePath(path);
    setOpenPaths((prev) => {
      const next = prev.filter((item) => item !== normalized);
      setActivePathState((current) =>
        current === normalized ? next.at(-1) : current,
      );
      return next;
    });
  }, []);

  const setActivePath = useCallback((path: string): void => {
    setActivePathState(normalizePath(path));
  }, []);

  const getFileState = useCallback(
    (path: string): WorkspaceFileState | undefined =>
      files.get(normalizePath(path)),
    [files],
  );

  const updateFileContents = useCallback(
    (path: string, contents: string): void => {
      const normalized = normalizePath(path);
      putFile(normalized, (prev) => {
        const binary = prev?.binary ?? isBinaryPath(normalized);
        const baseText = prev?.baseText ?? contents;
        const baseHash = prev?.baseHash ?? hashContents(contents);
        return {
          path: normalized,
          binary,
          contents,
          baseText,
          baseHash,
          serverHash: prev?.serverHash ?? null,
          dirty: !binary && hashContents(contents) !== baseHash,
          revision: prev?.revision ?? 1,
          conflict: prev?.conflict,
        };
      });
    },
    [putFile],
  );

  const saveFile = useCallback(
    (path: string): Promise<void> => {
      const normalized = normalizePath(path);
      return queueFsTask(async () => {
        const attempted = filesRef.current.get(normalized);
        if (attempted === undefined || attempted.binary || !attempted.dirty) {
          return;
        }
        setBusyCount((count) => count + 1);
        try {
          const result = await saveWorkspaceFile(appId, {
            path: normalized,
            contents: attempted.contents,
            encoding: "utf8",
            expectedHash: attempted.serverHash,
          });
          if (isSaveConflict(result)) {
            putFile(normalized, (latest) => {
              const current = latest ?? attempted;
              return {
                ...current,
                serverHash: result.serverHash,
                dirty: true,
                conflict: {
                  path: normalized,
                  base: attempted.baseText,
                  local: current.contents,
                  server: result.serverContents,
                },
              };
            });
            throw new WorkspaceSyncConflictError(normalized);
          }

          serverSnapshotRef.current.set(normalized, {
            binary: false,
            encoding: "utf8",
            contents: attempted.contents,
            text: attempted.contents,
            hash: result.hash,
          });
          try {
            const container = await getWebContainer();
            const latest = filesRef.current.get(normalized) ?? attempted;
            suppressRef.current.add(normalized);
            await writeContainerText(container, normalized, latest.contents);
          } catch (cause) {
            suppressRef.current.delete(normalized);
            putFile(normalized, (latest) => ({
              ...reconcileSavedFile(
                attempted,
                latest ?? attempted,
                result.hash,
              ),
              dirty: true,
            }));
            throw cause;
          }

          putFile(normalized, (latest) =>
            reconcileSavedFile(attempted, latest ?? attempted, result.hash),
          );
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId, putFile],
  );

  const saveAll = useCallback(async (): Promise<void> => {
    const errors: Error[] = [];
    for (const [path, file] of filesRef.current) {
      if (file.binary || !file.dirty) continue;
      if (file.conflict !== undefined) {
        errors.push(new WorkspaceSyncConflictError(path));
        continue;
      }
      try {
        await saveFile(path);
      } catch (cause) {
        errors.push(
          cause instanceof Error ? cause : new Error(`Failed to save ${path}`),
        );
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new Error(errors.map((item) => item.message).join("; "));
    }
  }, [saveFile]);

  const createFile = useCallback(
    (parentDir: string, name: string): Promise<void> => {
      const path = joinPath(parentDir, name);
      return queueFsTask(async () => {
        setBusyCount((count) => count + 1);
        try {
          const binary = isBinaryPath(path);
          const encoding = binary ? "base64" : "utf8";
          const result = await saveWorkspaceFile(appId, {
            path,
            contents: "",
            encoding,
            expectedHash: null,
          });
          if (isSaveConflict(result)) {
            throw new WorkspaceSyncConflictError(path);
          }
          serverSnapshotRef.current.set(path, {
            binary,
            encoding,
            contents: "",
            text: binary ? undefined : "",
            hash: result.hash,
          });

          const container = await getWebContainer();
          suppressRef.current.add(path);
          if (binary) {
            await writeContainerBytes(container, path, new Uint8Array());
          } else {
            await writeContainerText(container, path, "");
          }
          setTree(await walkContainerTree(container));
          openFile(path);
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId, openFile],
  );

  const createDirectory = useCallback(
    (parentDir: string, name: string): Promise<void> => {
      const path = joinPath(parentDir, name);
      return queueFsTask(async () => {
        setBusyCount((count) => count + 1);
        try {
          const response = await createWorkspaceDirectory(appId, path);
          assertMutationSucceeded(response);
          const container = await getWebContainer();
          suppressRef.current.add(path);
          await createContainerDirectory(container, path);
          setTree(await walkContainerTree(container));
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId],
  );

  const renamePath = useCallback(
    (from: string, to: string): Promise<void> => {
      const source = normalizePath(from);
      const target = normalizePath(to);
      if (source === target) return Promise.resolve();
      return queueFsTask(async () => {
        setBusyCount((count) => count + 1);
        try {
          const expectedHash =
            serverSnapshotRef.current.get(source)?.hash ?? null;
          const response = await renameWorkspacePath(
            appId,
            source,
            target,
            expectedHash,
          );
          assertMutationSucceeded(response);

          const container = await getWebContainer();
          suppressRef.current.add(source);
          suppressRef.current.add(target);
          await renameContainerPath(container, source, target);
          const nextSnapshot = new Map<string, WorkspaceFileContent>();
          for (const [path, content] of serverSnapshotRef.current) {
            nextSnapshot.set(remapPath(path, source, target), content);
          }
          serverSnapshotRef.current = nextSnapshot;
          const nextFiles = new Map<string, WorkspaceFileState>();
          for (const [path, state] of filesRef.current) {
            const mapped = remapPath(path, source, target);
            nextFiles.set(
              mapped,
              mapped === path ? state : { ...state, path: mapped },
            );
          }
          filesRef.current = nextFiles;
          setFiles(nextFiles);
          setOpenPaths((prev) =>
            prev.map((path) => remapPath(path, source, target)),
          );
          setActivePathState((prev) =>
            prev === undefined ? prev : remapPath(prev, source, target),
          );
          setTree(await walkContainerTree(container));
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId],
  );

  const deletePath = useCallback(
    (path: string): Promise<void> => {
      const target = normalizePath(path);
      const recursive = isDirectoryPath(tree, target);
      return queueFsTask(async () => {
        setBusyCount((count) => count + 1);
        try {
          const expectedHash =
            serverSnapshotRef.current.get(target)?.hash ?? null;
          const response = await deleteWorkspacePath(
            appId,
            target,
            expectedHash,
            recursive,
          );
          assertMutationSucceeded(response);

          const container = await getWebContainer();
          suppressRef.current.add(target);
          await removeContainerPath(container, target);
          for (const key of [...serverSnapshotRef.current.keys()]) {
            if (isUnder(key, target)) serverSnapshotRef.current.delete(key);
          }
          const nextFiles = new Map(filesRef.current);
          for (const key of [...nextFiles.keys()]) {
            if (isUnder(key, target)) nextFiles.delete(key);
          }
          filesRef.current = nextFiles;
          setFiles(nextFiles);
          setOpenPaths((prev) => prev.filter((item) => !isUnder(item, target)));
          setActivePathState((prev) =>
            prev !== undefined && isUnder(prev, target) ? undefined : prev,
          );
          setTree(await walkContainerTree(container));
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId, tree],
  );

  const acceptAgentChanges = useCallback(
    (path: string): Promise<void> => {
      const normalized = normalizePath(path);
      return queueFsTask(async () => {
        const file = filesRef.current.get(normalized);
        const conflict = file?.conflict;
        if (file === undefined || conflict === undefined) return;
        setBusyCount((count) => count + 1);
        try {
          const container = await getWebContainer();
          suppressRef.current.add(normalized);
          if (file.serverHash === null) {
            await removeContainerPath(container, normalized);
            serverSnapshotRef.current.delete(normalized);
            const nextFiles = new Map(filesRef.current);
            nextFiles.delete(normalized);
            filesRef.current = nextFiles;
            setFiles(nextFiles);
            setOpenPaths((prev) => prev.filter((item) => item !== normalized));
            setActivePathState((current) =>
              current === normalized ? undefined : current,
            );
          } else {
            await writeContainerText(container, normalized, conflict.server);
            serverSnapshotRef.current.set(normalized, {
              binary: false,
              encoding: "utf8",
              contents: conflict.server,
              text: conflict.server,
              hash: file.serverHash,
            });
            applyExternalContents(
              normalized,
              conflict.server,
              conflict.server,
              file.serverHash,
            );
          }
          setTree(await walkContainerTree(container));
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [applyExternalContents],
  );

  const keepLocalChanges = useCallback(
    (path: string, currentContents?: string): Promise<void> => {
      const normalized = normalizePath(path);
      return queueFsTask(async () => {
        const file = filesRef.current.get(normalized);
        if (file === undefined || file.conflict === undefined) return;
        const attemptedContents = currentContents ?? file.contents;
        const conflict = file.conflict;
        setBusyCount((count) => count + 1);
        try {
          const result = await saveWorkspaceFile(appId, {
            path: normalized,
            contents: attemptedContents,
            encoding: "utf8",
            expectedHash: file.serverHash,
          });
          if (isSaveConflict(result)) {
            putFile(normalized, (latest) => {
              const current = latest ?? file;
              return {
                ...current,
                contents: attemptedContents,
                serverHash: result.serverHash,
                dirty: true,
                conflict: {
                  path: normalized,
                  base: conflict.server,
                  local: attemptedContents,
                  server: result.serverContents,
                },
              };
            });
            throw new WorkspaceSyncConflictError(normalized);
          }

          serverSnapshotRef.current.set(normalized, {
            binary: false,
            encoding: "utf8",
            contents: attemptedContents,
            text: attemptedContents,
            hash: result.hash,
          });
          putFile(normalized, (latest) => ({
            ...(latest ?? file),
            contents: attemptedContents,
            serverHash: result.hash,
            dirty: true,
          }));
          const container = await getWebContainer();
          suppressRef.current.add(normalized);
          await writeContainerText(container, normalized, attemptedContents);
          applyExternalContents(
            normalized,
            attemptedContents,
            attemptedContents,
            result.hash,
          );
        } finally {
          setBusyCount((count) => count - 1);
        }
      });
    },
    [appId, applyExternalContents, putFile],
  );

  const attachTerminal = useCallback(
    (surface: TerminalSurface): TerminalHandle => {
      let disposed = false;
      let session: Awaited<ReturnType<typeof startShellSession>> | undefined;
      const pendingInput: string[] = [];
      void (async () => {
        try {
          const container = await getWebContainer();
          const started = await startShellSession(
            container,
            { cols: surface.cols, rows: surface.rows },
            surface.onOutput,
          );
          if (disposed) {
            started.dispose();
            return;
          }
          session = started;
          for (const chunk of pendingInput) started.write(chunk);
          pendingInput.length = 0;
          surface.onReady?.();
        } catch {
          // The shell could not start; the terminal stays passive.
        }
      })();
      return {
        write: (data) => {
          if (disposed) return;
          if (session === undefined) pendingInput.push(data);
          else session.write(data);
        },
        resize: (cols, rows) => session?.resize(cols, rows),
        dispose: () => {
          disposed = true;
          session?.dispose();
          session = undefined;
        },
      };
    },
    [],
  );

  const flushTerminalSync = useCallback(async (): Promise<void> => {
    do {
      await flushChangedNow();
      await terminalSyncChainRef.current;
    } while (changedPathsRef.current.size > 0);
  }, [flushChangedNow]);

  const reloadPreview = useCallback((): void => {
    reloadPreviewIframe(iframeRef.current);
  }, [iframeRef]);

  const clearError = useCallback((): void => {
    setError(undefined);
    setLogs("");
    setStatus((current) => (current === "failed" ? "idle" : current));
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      versionRef.current += 1;
      watcherRef.current?.close();
      watcherRef.current = undefined;
      if (debounceTimerRef.current !== undefined) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;
      }
      stopPreview(appId);
    };
  }, [appId]);

  useEffect(() => {
    if (enabled) boot();
  }, [enabled, boot]);

  useEffect(() => {
    const wasRunning = prevAgentRunningRef.current;
    agentRunningRef.current = agentRunning;
    if (agentRunning && !wasRunning) {
      runHadFilesRevisionRef.current = false;
    }

    const revisionChanged = filesRevision !== handledFilesRevisionRef.current;
    if (enabled && revisionChanged) {
      handledFilesRevisionRef.current = filesRevision;
      if (agentRunning || wasRunning) runHadFilesRevisionRef.current = true;
      resyncAfterAgent();
    } else if (
      enabled &&
      !agentRunning &&
      wasRunning &&
      !runHadFilesRevisionRef.current
    ) {
      resyncAfterAgent();
    }
    prevAgentRunningRef.current = agentRunning;
  }, [agentRunning, enabled, filesRevision, resyncAfterAgent]);

  const resolvedPreviewUrl = previewUrl ?? getActivePreviewUrl(appId);

  return {
    previewUrl: resolvedPreviewUrl,
    status,
    error,
    logs,
    reloadPreview,
    clearError,
    resync: boot,
    resyncAfterAgent,
    iframeRef,
    editMode: visualEditor.editMode,
    selectedElement: visualEditor.selectedElement,
    toggleEditMode: visualEditor.toggleEditMode,
    clearSelection: visualEditor.clearSelection,
    handleIframeLoad: visualEditor.handleIframeLoad,
    previewError: previewErrors.latest,
    clearPreviewError: previewErrors.clear,
    tree,
    treeLoading,
    refreshTree,
    openPaths,
    activePath,
    openFile,
    closeFile,
    setActivePath,
    getFileState,
    updateFileContents,
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
    busy: busyCount > 0,
  };
}

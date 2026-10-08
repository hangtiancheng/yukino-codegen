import {
  reloadPreview,
  type FileSystemTree,
  type WebContainer,
  type WebContainerProcess,
} from "@webcontainer/api";
import type { AppId } from "@/shared/schemas";
import { getWebContainer } from "@/shared/webcontainer";
import type { PreviewStatus } from "../preview-status";
import { hashContents } from "./workspace-paths";
import { containerHasNodeModules } from "./webcontainer-fs";

const MAX_LOG_LENGTH = 12_000;
const DEV_SERVER_TIMEOUT_MS = 30_000;
const DEPENDENCY_FILE_PATHS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

type ActivePreview = {
  readonly appId: AppId;
  callbacks: PreviewCallbacks;
  readonly process: WebContainerProcess;
  readonly url: string;
};

type CancelledOutcome = { readonly kind: "cancelled" };
type TimeoutOutcome = { readonly kind: "timeout" };

type PreviewRun = {
  readonly appId: AppId;
  readonly generation: number;
  cancelled: boolean;
  cleanup: (() => void) | undefined;
  process: WebContainerProcess | undefined;
  readonly cancelledOutcome: Promise<CancelledOutcome>;
  readonly resolveCancelled: () => void;
};

class PreviewRunCancelledError extends Error {
  constructor() {
    super("Preview run was cancelled");
    this.name = "PreviewRunCancelledError";
  }
}

// Module-level singletons: the dev server survives component remounts for the
// same app, and every filesystem mutation is serialized through one queue so
// mounts, installs, saves, and agent syncs never interleave on the FS.
let activePreview: ActivePreview | undefined;
let pendingPreview: PreviewRun | undefined;
let installedDependencyFingerprint: string | undefined;
let mountedAppId: AppId | undefined;
let previewGeneration = 0;
let fsQueue: Promise<void> = Promise.resolve();

export type PreviewCallbacks = {
  readonly onStatus: (status: PreviewStatus) => void;
  readonly onLog: (chunk: string) => void;
  readonly onReady: (url: string) => void;
  readonly onError: (message: string) => void;
  /** Aborts the run when the owning component unmounted or a newer run began. */
  readonly isCurrent: () => boolean;
};

/** Serialize a filesystem task against every other workspace FS operation. */
export function queueFsTask<T>(task: () => Promise<T>): Promise<T> {
  const run = fsQueue.catch(() => undefined).then(task);
  fsQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getActivePreviewUrl(appId: AppId): string | undefined {
  return activePreview?.appId === appId ? activePreview.url : undefined;
}

export function reloadPreviewIframe(iframe: HTMLIFrameElement | null): void {
  if (iframe === null) return;
  void reloadPreview(iframe);
}

export function stopPreview(appId: AppId): void {
  if (pendingPreview?.appId === appId) cancelPreviewRun(pendingPreview);
  if (activePreview?.appId === appId) retireActivePreview(activePreview);
}

/**
 * Mount the server tree, install dependencies only when package metadata
 * changed (or `node_modules` is missing), and start the Vite dev server.
 */
export function startPreview(
  appId: AppId,
  tree: FileSystemTree,
  callbacks: PreviewCallbacks,
): Promise<void> {
  const run = beginPreviewRun(appId);
  return queueFsTask(async () => {
    try {
      assertPreviewRunCurrent(run, callbacks);
      callbacks.onStatus("booting");
      const container = await getWebContainer();
      assertPreviewRunCurrent(run, callbacks);

      const sameProject = mountedAppId === appId;
      if (activePreview !== undefined && activePreview.appId !== appId) {
        retireActivePreview(activePreview);
      }

      callbacks.onStatus("mounting");
      if (!sameProject) mountedAppId = undefined;
      await clearProject(container, sameProject);
      assertPreviewRunCurrent(run, callbacks);
      await container.mount(tree);
      mountedAppId = appId;
      assertPreviewRunCurrent(run, callbacks);

      const dependencyFingerprint = dependencyFingerprintFromTree(tree);
      const hasNodeModules = await containerHasNodeModules(container);
      assertPreviewRunCurrent(run, callbacks);
      const needsInstall =
        !hasNodeModules ||
        dependencyFingerprint !== installedDependencyFingerprint;
      if (needsInstall) {
        callbacks.onStatus("installing");
        await runInstall(container, run, callbacks);
        assertPreviewRunCurrent(run, callbacks);
        installedDependencyFingerprint = dependencyFingerprint;
      }

      if (activePreview?.appId === appId) {
        activePreview.callbacks = callbacks;
        callbacks.onReady(activePreview.url);
        callbacks.onStatus("ready");
        return;
      }

      callbacks.onStatus("starting");
      const started = await startDevServer(container, run, callbacks);
      assertPreviewRunCurrent(run, callbacks);
      const preview: ActivePreview = {
        appId,
        callbacks,
        process: started.process,
        url: started.url,
      };
      activePreview = preview;
      run.process = undefined;
      callbacks.onReady(started.url);
      callbacks.onStatus("ready");
      observePreviewExit(started.process);
    } catch (cause) {
      const shouldReport = isRunCurrent(run, callbacks);
      cancelPreviewRun(run);
      if (!shouldReport || cause instanceof PreviewRunCancelledError) return;
      if (activePreview?.appId === appId) {
        retireActivePreview(activePreview);
      }
      callbacks.onError(errorMessage(cause, "Preview failed to start"));
      callbacks.onStatus("failed");
    } finally {
      finishPreviewRun(run);
    }
  });
}

export function clampLog(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-MAX_LOG_LENGTH);
}

/** Stable fingerprint of all dependency manifests understood by the runtime. */
export function dependencyFingerprintFromTree(tree: FileSystemTree): string {
  return DEPENDENCY_FILE_PATHS.map((path) => {
    const contents = fileContentsFromTree(tree, path);
    return contents === undefined
      ? `${path}:missing`
      : `${path}:${contents.length}:${hashContents(contents)}`;
  }).join("\n");
}

/** Pure generation/ownership check used by every asynchronous preview phase. */
export function isPreviewRunCurrent(
  runGeneration: number,
  currentGeneration: number,
  cancelled: boolean,
  ownerCurrent: boolean,
): boolean {
  return runGeneration === currentGeneration && !cancelled && ownerCurrent;
}

function fileContentsFromTree(
  tree: FileSystemTree,
  path: (typeof DEPENDENCY_FILE_PATHS)[number],
): string | undefined {
  const node = tree[path];
  if (node === undefined || !("file" in node)) return undefined;
  const fileNode = node.file;
  if (!("contents" in fileNode)) return undefined;
  return typeof fileNode.contents === "string"
    ? fileNode.contents
    : new TextDecoder().decode(fileNode.contents);
}

function beginPreviewRun(appId: AppId): PreviewRun {
  if (pendingPreview !== undefined) cancelPreviewRun(pendingPreview);
  previewGeneration += 1;
  let resolveCancelled = (): void => undefined;
  const cancelledOutcome = new Promise<CancelledOutcome>((resolve) => {
    resolveCancelled = () => resolve({ kind: "cancelled" });
  });
  const run: PreviewRun = {
    appId,
    generation: previewGeneration,
    cancelled: false,
    cleanup: undefined,
    process: undefined,
    cancelledOutcome,
    resolveCancelled,
  };
  pendingPreview = run;
  return run;
}

function isRunCurrent(run: PreviewRun, callbacks: PreviewCallbacks): boolean {
  return isPreviewRunCurrent(
    run.generation,
    previewGeneration,
    run.cancelled,
    callbacks.isCurrent(),
  );
}

function assertPreviewRunCurrent(
  run: PreviewRun,
  callbacks: PreviewCallbacks,
): void {
  if (!isRunCurrent(run, callbacks)) throw new PreviewRunCancelledError();
}

function cancelPreviewRun(run: PreviewRun): void {
  if (run.cancelled) return;
  run.cancelled = true;
  run.cleanup?.();
  run.cleanup = undefined;
  run.resolveCancelled();
  if (run.process !== undefined) {
    const process = run.process;
    run.process = undefined;
    safelyKill(process);
  }
}

function finishPreviewRun(run: PreviewRun): void {
  run.cleanup?.();
  run.cleanup = undefined;
  if (pendingPreview === run) pendingPreview = undefined;
}

function retireActivePreview(preview: ActivePreview): void {
  if (activePreview === preview) activePreview = undefined;
  safelyKill(preview.process);
}

function safelyKill(process: WebContainerProcess): void {
  try {
    process.kill();
  } catch {
    // The process may already have exited.
  }
}

async function clearProject(
  container: WebContainer,
  preserveNodeModules: boolean,
): Promise<void> {
  const names = await container.fs.readdir(".");
  await Promise.all(
    names
      .filter((name) => !preserveNodeModules || name !== "node_modules")
      .map((name) => container.fs.rm(name, { force: true, recursive: true })),
  );
}

async function removeIfPresent(
  container: WebContainer,
  path: string,
): Promise<void> {
  try {
    await container.fs.rm(path, { force: true });
  } catch {
    // Nothing to remove; ignore missing paths.
  }
}

function streamProcessOutput(
  process: WebContainerProcess,
  appendLog: (chunk: string) => void,
): void {
  void process.output
    .pipeTo(new WritableStream<string>({ write: appendLog }))
    .catch(() => undefined);
}

async function runInstall(
  container: WebContainer,
  run: PreviewRun,
  callbacks: PreviewCallbacks,
): Promise<void> {
  // npm has a long-standing optional-dependency bug (npm/cli#4828): a
  // package-lock.json resolved on another OS/libc omits the WebContainer's
  // musl-specific optional deps (e.g. @rollup/rollup-linux-x64-musl), so the
  // install "succeeds" but Vite then fails to start. Drop the lockfile first so
  // npm resolves the correct binaries for this platform.
  await removeIfPresent(container, "package-lock.json");
  const process = await container.spawn("npm", ["install"]);
  run.process = process;
  let exited = false;
  try {
    assertPreviewRunCurrent(run, callbacks);
    streamProcessOutput(process, callbacks.onLog);
    const exitCode = await process.exit;
    exited = true;
    assertPreviewRunCurrent(run, callbacks);
    if (exitCode !== 0) {
      throw new Error(`npm install exited with code ${exitCode}`);
    }
  } finally {
    if (run.process === process) run.process = undefined;
    if (!exited) safelyKill(process);
  }
}

type SpawnOutcome =
  | { readonly kind: "spawned"; readonly process: WebContainerProcess }
  | { readonly kind: "spawn-failed"; readonly cause: unknown };
type ReadyOutcome = { readonly kind: "ready"; readonly url: string };
type ExitOutcome =
  | { readonly kind: "exited"; readonly code: number }
  | { readonly kind: "exit-failed"; readonly cause: unknown };

async function startDevServer(
  container: WebContainer,
  run: PreviewRun,
  callbacks: PreviewCallbacks,
): Promise<{ readonly process: WebContainerProcess; readonly url: string }> {
  let unsubscribe: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cleanedUp = false;
  let started = false;

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubscribe?.();
    unsubscribe = undefined;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  };

  const timeoutOutcome = new Promise<TimeoutOutcome>((resolve) => {
    timeout = setTimeout(
      () => resolve({ kind: "timeout" }),
      DEV_SERVER_TIMEOUT_MS,
    );
  });
  let resolveReady: ((outcome: ReadyOutcome) => void) | undefined;
  const readyOutcome = new Promise<ReadyOutcome>((resolve) => {
    resolveReady = resolve;
  });

  try {
    unsubscribe = container.on("server-ready", (_port, url) => {
      resolveReady?.({ kind: "ready", url });
    });
    run.cleanup = cleanup;

    const spawnOutcome: Promise<SpawnOutcome> = Promise.resolve()
      .then(() =>
        container.spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"]),
      )
      .then(
        (process) => ({ kind: "spawned", process }),
        (cause: unknown) => ({ kind: "spawn-failed", cause }),
      );
    const spawnResult = await Promise.race([
      spawnOutcome,
      timeoutOutcome,
      run.cancelledOutcome,
    ]);

    if (spawnResult.kind !== "spawned") {
      void spawnOutcome.then((lateResult) => {
        if (lateResult.kind === "spawned") safelyKill(lateResult.process);
      });
      if (spawnResult.kind === "cancelled") {
        throw new PreviewRunCancelledError();
      }
      if (spawnResult.kind === "timeout") throw previewTimeoutError();
      throw new Error(
        errorMessage(spawnResult.cause, "Failed to spawn Vite dev server"),
      );
    }

    const process = spawnResult.process;
    run.process = process;
    assertPreviewRunCurrent(run, callbacks);
    streamProcessOutput(process, callbacks.onLog);
    const exitOutcome: Promise<ExitOutcome> = process.exit.then(
      (code) => ({ kind: "exited", code }),
      (cause: unknown) => ({ kind: "exit-failed", cause }),
    );
    const outcome = await Promise.race([
      readyOutcome,
      exitOutcome,
      timeoutOutcome,
      run.cancelledOutcome,
    ]);

    if (outcome.kind === "cancelled") {
      throw new PreviewRunCancelledError();
    }
    if (outcome.kind === "timeout") throw previewTimeoutError();
    if (outcome.kind === "exited") {
      throw new Error(
        `Vite exited before becoming ready (code ${outcome.code})`,
      );
    }
    if (outcome.kind === "exit-failed") {
      throw new Error(
        errorMessage(outcome.cause, "Vite exited before becoming ready"),
      );
    }

    assertPreviewRunCurrent(run, callbacks);
    started = true;
    return { process, url: outcome.url };
  } finally {
    cleanup();
    if (run.cleanup === cleanup) run.cleanup = undefined;
    if (!started && run.process !== undefined) {
      const process = run.process;
      run.process = undefined;
      safelyKill(process);
    }
  }
}

function observePreviewExit(process: WebContainerProcess): void {
  void process.exit
    .then(
      (code) => reportUnexpectedPreviewExit(process, `code ${code}`),
      (cause: unknown) =>
        reportUnexpectedPreviewExit(
          process,
          errorMessage(cause, "unknown process error"),
        ),
    )
    .catch(() => undefined);
}

function reportUnexpectedPreviewExit(
  process: WebContainerProcess,
  detail: string,
): void {
  const preview = activePreview;
  if (preview?.process !== process) return;
  activePreview = undefined;
  if (!preview.callbacks.isCurrent()) return;
  preview.callbacks.onError(`Vite preview exited unexpectedly (${detail})`);
  preview.callbacks.onStatus("failed");
}

function previewTimeoutError(): Error {
  return new Error("Vite did not become ready within 30 seconds");
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

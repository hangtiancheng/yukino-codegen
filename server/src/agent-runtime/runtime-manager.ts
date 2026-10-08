import { env } from "../config/index.js";
import type { PrismaDatabaseClient } from "../database/index.js";
import type { MetricsService } from "../observability/index.js";
import { buildCodeOutputDir } from "../project/index.js";
import { AgentRuntime } from "./agent-runtime.js";
import { createGitRuntime, type GitRuntime } from "./git-runtime.js";
import { type AgentStores, createAgentStores } from "./stores.js";
import { WorkspaceLockRegistry } from "./workspace-lock.js";

export type RuntimeManagerDeps = Readonly<{
  db: PrismaDatabaseClient;
  metrics: MetricsService;
  projectRootDir?: string;
  idleMs?: number;
}>;

export type SoftSettingsPatch = Parameters<AgentRuntime["applySoftSettings"]>[0];

export type RuntimeManagerApi = Readonly<{
  applySoftSettings: (ownerId: bigint, appId: bigint, patch: SoftSettingsPatch) => void;
  disposeAll: () => Promise<void>;
  getOrCreate: (ownerId: bigint, appId: bigint) => Promise<AgentRuntime>;
  git: GitRuntime;
  invalidate: (ownerId: bigint, appId: bigint) => Promise<void>;
  stores: AgentStores;
  workDirFor: (appId: bigint) => string;
}>;

/**
 * Owns the lifecycle of per-app AgentRuntime instances. Runtimes are keyed by
 * `${ownerId}:${appId}` (the canonical workspace belongs to the app owner), live
 * across connections, and are evicted after an idle window. On shutdown every
 * runtime is disposed (MCP disconnect, hook shutdown, file-history save, abort).
 */
export const createRuntimeManager = (deps: RuntimeManagerDeps): RuntimeManagerApi => {
  const stores: AgentStores = createAgentStores(deps.db);
  const git: GitRuntime = createGitRuntime();
  const rootDir = deps.projectRootDir ?? process.cwd();
  const idleMs = deps.idleMs ?? env.AGENT_WORKSPACE_IDLE_MS;
  const runtimes = new Map<string, AgentRuntime>();
  const lifecycleLocks = new WorkspaceLockRegistry();
  const lifecycleTasks = new Set<Promise<void>>();
  let sweepTimer: NodeJS.Timeout | undefined;
  let closing = false;
  let disposeAllPromise: Promise<void> | undefined;

  const keyFor = (ownerId: bigint, appId: bigint): string => `${ownerId}:${appId}`;
  const workDirFor = (appId: bigint): string => buildCodeOutputDir(rootDir, appId.toString());

  const trackLifecycle = <T>(operation: Promise<T>): Promise<T> => {
    const completion = operation.then(
      () => undefined,
      () => undefined,
    );
    lifecycleTasks.add(completion);
    void completion.then(() => lifecycleTasks.delete(completion));
    return operation;
  };

  const runLifecycle = <T>(key: string, task: () => Promise<T>): Promise<T> =>
    trackLifecycle(lifecycleLocks.get(key).run(task));

  const getOrCreate = (ownerId: bigint, appId: bigint): Promise<AgentRuntime> => {
    if (closing) return Promise.reject(new Error("Runtime manager is disposing"));
    const key = keyFor(ownerId, appId);
    return runLifecycle(key, async () => {
      if (closing) throw new Error("Runtime manager is disposing");
      const existing = runtimes.get(key);
      if (existing !== undefined) {
        existing.touch();
        return existing;
      }
      const workspace = await stores.workspaces.getOrCreate(ownerId, appId);
      if (closing) throw new Error("Runtime manager is disposing");
      const runtime = new AgentRuntime({
        appId,
        git,
        metrics: deps.metrics,
        stores,
        workDir: workDirFor(appId),
        workspace,
      });
      runtimes.set(key, runtime);
      return runtime;
    });
  };

  const invalidate = (ownerId: bigint, appId: bigint): Promise<void> => {
    if (closing) return disposeAllPromise ?? Promise.resolve();
    const key = keyFor(ownerId, appId);
    return runLifecycle(key, async () => {
      const runtime = runtimes.get(key);
      if (runtime === undefined) return;
      runtimes.delete(key);
      await runtime.dispose();
    });
  };

  const applySoftSettings = (ownerId: bigint, appId: bigint, patch: SoftSettingsPatch): void => {
    if (closing) return;
    runtimes.get(keyFor(ownerId, appId))?.applySoftSettings(patch);
  };

  const sweep = async (): Promise<void> => {
    if (closing) return;
    const now = Date.now();
    const expired = [...runtimes.entries()].filter(
      ([, runtime]) => !runtime.isBusy && now - runtime.lastActivity > idleMs,
    );
    await Promise.all(
      expired.map(([key, candidate]) =>
        runLifecycle(key, async () => {
          if (closing) return;
          const runtime = runtimes.get(key);
          if (
            runtime !== candidate ||
            runtime.isBusy ||
            Date.now() - runtime.lastActivity <= idleMs
          ) {
            return;
          }
          runtimes.delete(key);
          await runtime.dispose();
        }),
      ),
    );
  };

  const start = (): void => {
    if (sweepTimer !== undefined) return;
    sweepTimer = setInterval(() => {
      void sweep().catch(() => undefined);
    }, 60_000);
    sweepTimer.unref?.();
  };

  const waitForLifecycleTasks = async (): Promise<void> => {
    while (lifecycleTasks.size > 0) {
      await Promise.all([...lifecycleTasks]);
    }
  };

  const disposeAll = (): Promise<void> => {
    if (disposeAllPromise !== undefined) return disposeAllPromise;
    closing = true;
    if (sweepTimer !== undefined) {
      clearInterval(sweepTimer);
      sweepTimer = undefined;
    }
    disposeAllPromise = (async () => {
      await waitForLifecycleTasks();
      await Promise.all(
        [...runtimes.entries()].map(([key, runtime]) =>
          lifecycleLocks.get(key).run(async () => {
            if (runtimes.get(key) === runtime) runtimes.delete(key);
            await runtime.dispose();
          }),
        ),
      );
    })();
    return disposeAllPromise;
  };

  start();

  return { applySoftSettings, disposeAll, getOrCreate, git, invalidate, stores, workDirFor };
};

export type RuntimeManager = ReturnType<typeof createRuntimeManager>;

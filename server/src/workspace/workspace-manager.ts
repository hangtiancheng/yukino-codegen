import { createHash, randomBytes } from "node:crypto";
import { cp, lstat, readFile, realpath, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, resolve, sep } from "node:path";
import type { IPty } from "node-pty";
import { env } from "../config/index.js";
import { type SandboxFactory, SandboxSession } from "./sandbox-session.js";
import { servePreview } from "./static-preview.js";

export type BuildStatus = "idle" | "installing" | "building" | "ready" | "failed";
export type PreviewState = {
  status: BuildStatus;
  logs: string;
  error?: string;
  revision: number;
  path?: string;
};
type Workspace = {
  token: string;
  workDir: string;
  lastActivity: number;
  state: PreviewState;
  session?: Promise<SandboxSession>;
  build?: Promise<void>;
  abort?: AbortController;
  artifact?: string;
  releases: Map<number, string>;
  dependenciesHash?: string;
  terminals: Map<IPty, Promise<void>>;
  pendingTerminals: number;
};
type Options = {
  workDirFor: (appId: bigint) => string;
  sandboxFactory?: SandboxFactory;
  idleMs?: number;
  buildTimeoutMs?: number;
};

export class WorkspaceManager {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly tokens = new Map<string, Workspace>();
  private server?: Server;
  private closing = false;
  private disposePromise?: Promise<void>;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly options: Options) {
    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, 60_000);
    this.sweepTimer.unref();
  }

  private get(appId: bigint): Workspace {
    if (this.closing) throw new Error("Workspace manager is shutting down");
    const key = String(appId);
    let workspace = this.workspaces.get(key);
    if (workspace === undefined) {
      workspace = {
        token: randomBytes(24).toString("hex"),
        workDir: this.options.workDirFor(appId),
        lastActivity: Date.now(),
        state: { status: "idle", logs: "", revision: 0 },
        terminals: new Map(),
        releases: new Map(),
        pendingTerminals: 0,
      };
      this.workspaces.set(key, workspace);
      this.tokens.set(workspace.token, workspace);
    }
    workspace.lastActivity = Date.now();
    return workspace;
  }

  private session(workspace: Workspace): Promise<SandboxSession> {
    workspace.session ??= SandboxSession.create(
      workspace.workDir,
      this.options.sandboxFactory,
    ).catch((error: unknown) => {
      delete workspace.session;
      throw error;
    });
    return workspace.session;
  }

  status(appId: bigint): PreviewState {
    const workspace = this.get(appId);
    return {
      ...workspace.state,
      ...(workspace.artifact !== undefined && {
        path: `/p/${workspace.token}/${workspace.state.revision}/`,
      }),
    };
  }

  async build(
    appId: bigint,
    runExclusive: (task: () => Promise<void>) => Promise<void> = (task) => task(),
  ): Promise<PreviewState> {
    const workspace = this.get(appId);
    if (workspace.build !== undefined) return this.status(appId);
    // Claim before any await so simultaneous tabs share one build.
    workspace.state = { status: "installing", logs: "", revision: workspace.state.revision };
    const abort = new AbortController();
    workspace.abort = abort;
    workspace.build = runExclusive(() => this.runBuild(workspace, abort.signal))
      .catch((error: unknown) => {
        workspace.state.status = "failed";
        workspace.state.error = error instanceof Error ? error.message : "Build failed";
      })
      .finally(() => {
        delete workspace.build;
        delete workspace.abort;
      });
    return this.status(appId);
  }

  private async runBuild(workspace: Workspace, signal: AbortSignal) {
    const timer = setTimeout(
      () => workspace.abort?.abort(),
      this.options.buildTimeoutMs ?? env.WORKSPACE_BUILD_TIMEOUT_MS,
    );
    timer.unref();
    const log = (chunk: string) => {
      workspace.state.logs = (workspace.state.logs + chunk).slice(-64_000);
    };
    try {
      if (!(await stat(join(workspace.workDir, "package.json")).catch(() => undefined))) {
        workspace.state.status = "idle";
        return;
      }
      const session = await this.session(workspace);
      signal.throwIfAborted();
      const dependencyFiles = await Promise.all(
        [
          "package.json",
          "package-lock.json",
          "npm-shrinkwrap.json",
          "pnpm-lock.yaml",
          "yarn.lock",
          "bun.lock",
          "bun.lockb",
        ].map(async (file) => readFile(join(workspace.workDir, file)).catch(() => Buffer.alloc(0))),
      );
      const hash = createHash("sha256");
      for (const content of dependencyFiles) hash.update(content).update("\0");
      const dependenciesHash = hash.digest("hex");
      if (
        workspace.dependenciesHash !== dependenciesHash ||
        !(await stat(join(workspace.workDir, "node_modules")).catch(() => undefined))
      ) {
        log("$ npm install --no-audit --no-fund\n");
        await session.run("npm install --no-audit --no-fund", signal, log);
        // npm may create/update its lockfile. Hash again on the next build rather than skipping a changed manifest.
        workspace.dependenciesHash = dependenciesHash;
      }
      workspace.state.status = "building";
      log("\n$ npm run build -- --base=./\n");
      // Vite's relative asset base makes dist portable under each capability URL.
      // Clear stale output first: a failed/no-op build must never publish an old dist.
      const dist = join(workspace.workDir, "dist");
      await rm(dist, { recursive: true, force: true });
      await session.run("npm run build -- --base=./", signal, log);
      signal.throwIfAborted();
      const info = await lstat(dist);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Build must produce a dist directory");
      const index = await realpath(join(dist, "index.html"));
      if (!index.startsWith(`${resolve(dist)}${sep}`))
        throw new Error("dist/index.html escapes the project");
      const artifact = join(session.scratchDir, `preview-${workspace.state.revision + 1}`);
      await cp(dist, artifact, { recursive: true, dereference: false });
      signal.throwIfAborted();
      workspace.artifact = artifact;
      workspace.state.status = "ready";
      workspace.state.revision += 1;
      workspace.releases.set(workspace.state.revision, artifact);
      // Existing iframes keep a stable asset base while the next build loads.
      for (const [revision, directory] of workspace.releases) {
        if (revision < workspace.state.revision - 1) {
          workspace.releases.delete(revision);
          await rm(directory, { recursive: true, force: true });
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async openTerminal(
    appId: bigint,
    cols: number,
    rows: number,
    onData: (data: string) => void,
    onExit: (code: number) => void,
  ) {
    const workspace = this.get(appId);
    if (workspace.terminals.size + workspace.pendingTerminals >= 4)
      throw new Error("Too many terminals for this app");
    workspace.pendingTerminals += 1;
    try {
      const session = await this.session(workspace);
      if (this.closing || !this.tokens.has(workspace.token)) throw new Error("Workspace closed");
      const prepared = await session.prepare("exec bash --noprofile --norc -i");
      let terminal: IPty;
      try {
        const pty = await import("node-pty");
        if (this.closing || !this.tokens.has(workspace.token)) throw new Error("Workspace closed");
        terminal = pty.spawn(prepared.executable, prepared.args, {
          name: "xterm-256color",
          cols,
          rows,
          cwd: workspace.workDir,
          env: prepared.env,
        });
      } catch (error) {
        await prepared.cleanup?.();
        throw error;
      }
      terminal.onData((data) => {
        workspace.lastActivity = Date.now();
        onData(data);
      });
      const completion = new Promise<void>((resolve) =>
        terminal.onExit(({ exitCode }) => {
          workspace.terminals.delete(terminal);
          onExit(exitCode);
          void Promise.resolve(prepared.cleanup?.())
            .catch(() => undefined)
            .finally(resolve);
        }),
      );
      workspace.terminals.set(terminal, completion);
      return {
        write: (data: string) => {
          workspace.lastActivity = Date.now();
          terminal.write(data);
        },
        resize: (width: number, height: number) => terminal.resize(width, height),
        dispose: () => {
          try {
            terminal.kill();
          } catch {}
        },
        completion,
      };
    } finally {
      workspace.pendingTerminals -= 1;
    }
  }

  async listen(port = env.PREVIEW_PORT, host = env.PREVIEW_HOST): Promise<number> {
    if (this.server !== undefined) throw new Error("Preview server already started");
    const server = createServer((request, response) => {
      const match = /^\/p\/([a-f0-9]{48})\/(\d+)\/(.*?)(?:\?.*)?$/u.exec(request.url ?? "");
      const workspace = match === null ? undefined : this.tokens.get(match[1]);
      const artifact = match === null ? undefined : workspace?.releases.get(Number(match[2]));
      if (artifact === undefined || workspace === undefined || match === null) {
        response.writeHead(404).end();
        return;
      }
      workspace.lastActivity = Date.now();
      void servePreview(
        request,
        response,
        artifact,
        match[3],
        `/p/${workspace.token}/${match[2]}/`,
      ).catch(() => {
        if (!response.headersSent) response.writeHead(404);
        response.end();
      });
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Preview server has no port");
    return address.port;
  }

  private async disposeWorkspace(workspace: Workspace) {
    this.tokens.delete(workspace.token);
    workspace.abort?.abort();
    const completions = [...workspace.terminals.values()];
    for (const terminal of workspace.terminals.keys()) {
      try {
        terminal.kill();
      } catch {}
    }
    await Promise.all(completions);
    await workspace.build;
    await workspace.session?.then((session) => session.dispose()).catch(() => undefined);
  }

  async disposeApp(appId: bigint): Promise<void> {
    const workspace = this.workspaces.get(String(appId));
    if (workspace === undefined) return;
    this.workspaces.delete(String(appId));
    await this.disposeWorkspace(workspace);
  }

  private async sweep() {
    for (const [id, workspace] of this.workspaces) {
      if (
        workspace.build !== undefined ||
        Date.now() - workspace.lastActivity < (this.options.idleMs ?? env.AGENT_WORKSPACE_IDLE_MS)
      )
        continue;
      this.workspaces.delete(id);
      await this.disposeWorkspace(workspace);
    }
  }

  dispose(): Promise<void> {
    this.disposePromise ??= (async () => {
      this.closing = true;
      clearInterval(this.sweepTimer);
      this.server?.closeAllConnections();
      await Promise.all(
        [...this.workspaces.values()].map((workspace) => this.disposeWorkspace(workspace)),
      );
      this.workspaces.clear();
      const server = this.server;
      if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    })();
    return this.disposePromise;
  }
}

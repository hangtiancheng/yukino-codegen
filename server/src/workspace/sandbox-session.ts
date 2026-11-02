import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sandbox } from "@yukino.js/yukino";

export type SandboxFactory = () => Promise<Sandbox.Sandbox | null>;

/** An explicit environment prevents project scripts from inheriting backend credentials. */
export function workspaceEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    HOME: directory,
    TMPDIR: directory,
    XDG_CACHE_HOME: join(directory, "cache"),
    npm_config_cache: join(directory, "npm-cache"),
    npm_config_update_notifier: "false",
  };
}

export class SandboxSession {
  private constructor(
    readonly workDir: string,
    readonly scratchDir: string,
    private readonly sandbox: Sandbox.Sandbox,
  ) {}

  static async create(workDir: string, factory: SandboxFactory = Sandbox.createSandbox) {
    const sandbox = await factory();
    if (sandbox === null || !(await sandbox.available())) {
      await sandbox?.dispose?.();
      throw new Error(
        "Yukino sandbox is unavailable. Install bubblewrap and enable user namespaces on Linux, or use macOS seatbelt. Commands were not executed.",
      );
    }
    await mkdir(workDir, { recursive: true });
    const scratchDir = await mkdtemp(join(tmpdir(), "yukino-workspace-"));
    return new SandboxSession(workDir, scratchDir, sandbox);
  }

  async prepare(command: string) {
    const prepared = await this.sandbox.prepare(
      command,
      { allowWrite: [this.workDir, this.scratchDir], denyWrite: [], networkEnabled: true },
      { cwd: this.workDir },
    );
    return { ...prepared, env: workspaceEnvironment(this.scratchDir) };
  }

  async run(command: string, signal: AbortSignal, onOutput: (chunk: string) => void) {
    const prepared = await this.prepare(command);
    try {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const child = spawn(prepared.executable, prepared.args, {
          cwd: this.workDir,
          env: { ...prepared.env, CI: "true" },
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const kill = () => {
          if (child.pid === undefined) return;
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        };
        signal.addEventListener("abort", kill, { once: true });
        if (signal.aborted) kill();
        child.stdout.on("data", (data: Buffer) => onOutput(data.toString("utf8")));
        child.stderr.on("data", (data: Buffer) => onOutput(data.toString("utf8")));
        child.once("error", (error) => {
          signal.removeEventListener("abort", kill);
          reject(error);
        });
        child.once("close", (code) => {
          signal.removeEventListener("abort", kill);
          // Also reap descendants left behind by a lifecycle/build script.
          kill();
          if (signal.aborted) reject(new Error("Build cancelled or timed out"));
          else if (code !== 0) reject(new Error(`Command exited with code ${String(code)}`));
          else resolve();
        });
      });
    } finally {
      await prepared.cleanup?.();
    }
  }

  async dispose() {
    await this.sandbox.dispose?.();
    await rm(this.scratchDir, { recursive: true, force: true });
  }
}

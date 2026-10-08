import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Worktree } from "@yukino.js/yukino";
import { env } from "../config/index.js";

const run = promisify(execFile);

const authorArgs = (): string[] => [
  "-c",
  `user.name=${env.GIT_SNAPSHOT_AUTHOR_NAME}`,
  "-c",
  `user.email=${env.GIT_SNAPSHOT_AUTHOR_EMAIL}`,
];

const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await run("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
};

const isGitRepo = (dir: string): boolean => existsSync(join(dir, ".git"));

export type GitSnapshot = Readonly<{
  sha: string;
  message: string;
  date: string;
}>;

export type GitRuntimeApi = Readonly<{
  createWorktree: (
    slug: string,
    gitRoot?: string,
  ) => Promise<Worktree.WorktreeResult>;
  ensureRepo: (dir: string) => Promise<boolean>;
  listSnapshots: (
    dir: string,
    limit?: number,
  ) => Promise<readonly GitSnapshot[]>;
  removeWorktree: (
    path: string,
    branch: string,
    gitRoot: string,
  ) => Promise<void>;
  rewindTo: (dir: string, sha: string) => Promise<boolean>;
  snapshot: (dir: string, message: string) => Promise<string | undefined>;
}>;

/**
 * Best-effort internal git integration for a generated project. All operations
 * swallow failures (missing git binary, non-repo) because version snapshots are
 * a convenience layered on top of the primary file-history mechanism.
 */
export const createGitRuntime = (): GitRuntimeApi => {
  const ensureRepo = async (dir: string): Promise<boolean> => {
    if (!existsSync(dir)) return false;
    if (isGitRepo(dir)) return true;
    try {
      await git(dir, ["init"]);
      // A .gitignore keeps snapshots small; excludes are also honored by zip export.
      await git(dir, [...authorArgs(), "add", "-A"]);
      await git(dir, [
        ...authorArgs(),
        "commit",
        "-m",
        "chore: initial project snapshot",
        "--allow-empty",
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const snapshot = async (
    dir: string,
    message: string,
  ): Promise<string | undefined> => {
    if (!(await ensureRepo(dir))) return undefined;
    try {
      await git(dir, [...authorArgs(), "add", "-A"]);
      const status = await git(dir, ["status", "--porcelain"]);
      if (status.length === 0) return undefined;
      await git(dir, [...authorArgs(), "commit", "-m", message]);
      return git(dir, ["rev-parse", "HEAD"]);
    } catch {
      return undefined;
    }
  };

  const listSnapshots = async (
    dir: string,
    limit = 50,
  ): Promise<ReadonlyArray<{ sha: string; message: string; date: string }>> => {
    if (!isGitRepo(dir)) return [];
    try {
      const log = await git(dir, [
        "log",
        `-n${String(limit)}`,
        "--pretty=format:%H%x1f%s%x1f%cI",
      ]);
      if (log.length === 0) return [];
      return log.split("\n").map((line) => {
        const [sha = "", message = "", date = ""] = line.split("\u001f");
        return { date, message, sha };
      });
    } catch {
      return [];
    }
  };

  const rewindTo = async (dir: string, sha: string): Promise<boolean> => {
    if (!isGitRepo(dir)) return false;
    try {
      await git(dir, ["checkout", sha, "--", "."]);
      await git(dir, [...authorArgs(), "add", "-A"]);
      await git(dir, [
        ...authorArgs(),
        "commit",
        "-m",
        `chore: rewind to ${sha}`,
        "--allow-empty",
      ]);
      return true;
    } catch {
      return false;
    }
  };

  return {
    createWorktree: (slug: string, gitRoot?: string) =>
      Worktree.createAgentWorktree(slug, gitRoot),
    ensureRepo,
    listSnapshots,
    removeWorktree: (path: string, branch: string, gitRoot: string) =>
      Worktree.removeAgentWorktree(path, branch, gitRoot),
    rewindTo,
    snapshot,
  };
};

export type GitRuntime = ReturnType<typeof createGitRuntime>;

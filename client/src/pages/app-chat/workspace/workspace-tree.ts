import type { FileSystemTree } from "@webcontainer/api";
import type { AgentFileTreeNode } from "@/shared/schemas";
import {
  hashContents,
  isBinaryPath,
  isIgnoredSegment,
  normalizePath,
} from "./workspace-paths";
import type { WorkspaceFileState } from "./workspace-types";

/** A node in the explorer tree. Directories carry their sorted children. */
export type WorkspaceNode =
  | {
      readonly kind: "file";
      readonly name: string;
      readonly path: string;
      readonly binary: boolean;
    }
  | {
      readonly kind: "directory";
      readonly name: string;
      readonly path: string;
      readonly children: readonly WorkspaceNode[];
    };

/** Server-known transport contents and hash of a single file. */
export type WorkspaceFileContent = {
  readonly binary: boolean;
  readonly encoding: "utf8" | "base64";
  /** Original server payload, including base64 data for binary files. */
  readonly contents: string;
  /** Decoded editor text when the file is not binary. */
  readonly text: string | undefined;
  /** Server content hash used as the optimistic-locking base revision. */
  readonly hash: string;
};

/** A full snapshot fetched from the server: structure plus file contents. */
export type WorkspaceSnapshot = {
  readonly nodes: readonly WorkspaceNode[];
  readonly files: ReadonlyMap<string, WorkspaceFileContent>;
};

function base64ToBytes(contents: string): Uint8Array {
  const binary = atob(contents);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Directories first, then files, each alphabetical and case-insensitive. */
export function sortNodes(
  nodes: readonly WorkspaceNode[],
): readonly WorkspaceNode[] {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  });
}

/**
 * Convert the server's {@link AgentFileTreeNode} into a WebContainer mount
 * tree. Binary (`base64`) files are decoded to bytes; text files stay strings.
 */
export function agentTreeToFileSystem(root: AgentFileTreeNode): FileSystemTree {
  if (root.type === "file") return {};
  return buildFileSystem(root.children);
}

function buildFileSystem(nodes: readonly AgentFileTreeNode[]): FileSystemTree {
  const result: FileSystemTree = {};
  for (const node of nodes) {
    if (isIgnoredSegment(node.name)) continue;
    if (node.type === "directory") {
      result[node.name] = { directory: buildFileSystem(node.children) };
      continue;
    }
    result[node.name] = {
      file: {
        contents:
          node.encoding === "base64"
            ? base64ToBytes(node.contents)
            : node.contents,
      },
    };
  }
  return result;
}

/**
 * Build explorer nodes and a content/hash map from the server tree, skipping
 * ignored directories such as `node_modules`.
 */
export function snapshotFromAgentTree(
  root: AgentFileTreeNode,
): WorkspaceSnapshot {
  const files = new Map<string, WorkspaceFileContent>();
  const nodes =
    root.type === "directory" ? collectNodes(root.children, files) : [];
  return { nodes, files };
}

function collectNodes(
  children: readonly AgentFileTreeNode[],
  files: Map<string, WorkspaceFileContent>,
): readonly WorkspaceNode[] {
  const nodes: WorkspaceNode[] = [];
  for (const child of children) {
    if (isIgnoredSegment(child.name)) continue;
    const path = normalizePath(child.path);
    if (child.type === "directory") {
      nodes.push({
        kind: "directory",
        name: child.name,
        path,
        children: collectNodes(child.children, files),
      });
      continue;
    }
    const binary = child.encoding === "base64" || isBinaryPath(path);
    files.set(path, {
      binary,
      encoding: child.encoding,
      contents: child.contents,
      text: binary ? undefined : child.contents,
      hash: child.hash,
    });
    nodes.push({ kind: "file", name: child.name, path, binary });
  }
  return sortNodes(nodes);
}

const DEPENDENCY_FILE_PATHS: readonly string[] = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

/** Whether package metadata changed enough to require remounting dependencies. */
export function dependencyFilesChanged(
  previous: ReadonlyMap<string, WorkspaceFileContent>,
  next: ReadonlyMap<string, WorkspaceFileContent>,
): boolean {
  return DEPENDENCY_FILE_PATHS.some(
    (path) => previous.get(path)?.hash !== next.get(path)?.hash,
  );
}

export function reconcileSavedFile(
  attempted: WorkspaceFileState,
  latest: WorkspaceFileState,
  serverHash: string,
): WorkspaceFileState {
  return {
    ...latest,
    baseText: attempted.contents,
    baseHash: hashContents(attempted.contents),
    serverHash,
    dirty: latest.contents !== attempted.contents,
    conflict: undefined,
  };
}

export type MergeResult =
  { readonly clean: true; readonly text: string } | { readonly clean: false };

/**
 * Practical three-way merge. When only one side diverged from the common base
 * it takes that side; identical edits collapse to one; anything else is a
 * conflict that the caller resolves through the diff editor.
 */
export function threeWayMerge(
  base: string,
  local: string,
  server: string,
): MergeResult {
  if (local === server) return { clean: true, text: local };
  if (base === local) return { clean: true, text: server };
  if (base === server) return { clean: true, text: local };
  return { clean: false };
}

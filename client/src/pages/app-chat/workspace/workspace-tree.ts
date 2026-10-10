import type { FileSystemTree } from "@webcontainer/api";
import type { AgentFileTreeNode } from "@/shared/schemas";
import {
  hashContents,
  isBinaryPath,
  isIgnoredSegment,
  normalizePath,
} from "./workspace-paths";
import type { WorkspaceFileState } from "./workspace-types";

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

export type WorkspaceFileContent = {
  readonly binary: boolean;
  readonly encoding: "utf8" | "base64";
  readonly contents: string;
  readonly text: string | undefined;
  readonly hash: string;
};

export type WorkspaceSnapshot = {
  readonly nodes: readonly WorkspaceNode[];
  readonly files: ReadonlyMap<string, WorkspaceFileContent>;
};

function base64ToBytes(contents: string): Uint8Array {
  const binary = atob(contents);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

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

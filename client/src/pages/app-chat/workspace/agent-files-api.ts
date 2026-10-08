import {
  createAgentDirectory,
  deleteAgentEntry,
  fetchAgentFileTree,
  isAgentFileConflictResponse,
  renameAgentEntry,
  writeAgentFile,
} from "@/shared/api";
import type {
  AgentFileMutationResponse,
  AgentFileTreeNode,
  AppId,
} from "@/shared/schemas";

/**
 * Thin workspace-facing adapter over the shared Agent file-sync REST API. It
 * keeps the controller decoupled from the wire schema and maps optimistic-lock
 * conflicts into a shape the editor's diff workflow consumes, fetching the
 * current server contents so the diff editor has both sides.
 */

export type SaveFileInput = {
  readonly path: string;
  readonly contents: string;
  readonly encoding: "utf8" | "base64";
  /** Server hash of the base revision, or null when creating a new file. */
  readonly expectedHash: string | null;
};

export type SaveFileResult =
  | { readonly status: "saved"; readonly path: string; readonly hash: string }
  | {
      readonly status: "conflict";
      readonly path: string;
      readonly serverContents: string;
      readonly serverHash: string | null;
    };

export function isSaveConflict(
  result: SaveFileResult,
): result is Extract<SaveFileResult, { status: "conflict" }> {
  return result.status === "conflict";
}

export async function fetchWorkspaceTree(
  appId: AppId,
): Promise<AgentFileTreeNode> {
  return fetchAgentFileTree(appId);
}

export async function saveWorkspaceFile(
  appId: AppId,
  input: SaveFileInput,
): Promise<SaveFileResult> {
  const response = await writeAgentFile(appId, {
    path: input.path,
    contents: input.contents,
    encoding: input.encoding,
    expectedHash: input.expectedHash,
  });
  if (isAgentFileConflictResponse(response)) {
    const serverContents = await readServerFileContents(appId, input.path);
    return {
      status: "conflict",
      path: response.conflict.path,
      serverContents,
      serverHash: response.conflict.actualHash,
    };
  }
  return {
    status: "saved",
    path: response.result.path,
    hash: response.result.hash ?? "",
  };
}

export async function deleteWorkspacePath(
  appId: AppId,
  path: string,
  expectedHash: string | null | undefined,
  recursive: boolean,
): Promise<AgentFileMutationResponse> {
  return deleteAgentEntry(appId, { path, expectedHash, recursive });
}

export async function renameWorkspacePath(
  appId: AppId,
  from: string,
  to: string,
  expectedHash: string | null | undefined,
): Promise<AgentFileMutationResponse> {
  return renameAgentEntry(appId, { from, to, expectedHash });
}

export async function createWorkspaceDirectory(
  appId: AppId,
  path: string,
): Promise<AgentFileMutationResponse> {
  return createAgentDirectory(appId, { path });
}

async function readServerFileContents(
  appId: AppId,
  path: string,
): Promise<string> {
  const root = await fetchAgentFileTree(appId);
  const node = findFileNode(root, path);
  if (node === undefined || node.type !== "file") return "";
  return node.encoding === "base64" ? "" : node.contents;
}

function findFileNode(
  node: AgentFileTreeNode,
  path: string,
): AgentFileTreeNode | undefined {
  if (node.type === "file") return node.path === path ? node : undefined;
  for (const child of node.children) {
    const found = findFileNode(child, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

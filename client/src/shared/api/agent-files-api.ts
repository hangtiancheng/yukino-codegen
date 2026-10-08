import {
  agentDirectoryCreateRequestSchema,
  agentFileDeleteRequestSchema,
  agentFileMutationResponseSchema,
  agentFileRenameRequestSchema,
  agentFileTreeNodeSchema,
  agentFileWriteRequestSchema,
  type AgentDirectoryCreateRequest,
  type AgentFileDeleteRequest,
  type AgentFileMutationResponse,
  type AgentFileRenameRequest,
  type AgentFileTreeNode,
  type AgentFileWriteRequest,
  type AppId,
} from "@/shared/schemas";
import { httpClient } from "./http-client-singleton";

/**
 * Authoritative server file APIs for the browser IDE. The server disk is the
 * source of truth; these endpoints expose hashed reads and optimistic-locking
 * writes that keep Monaco / the terminal in sync with the runtime.
 */

export async function fetchAgentFileTree(
  appId: AppId,
): Promise<AgentFileTreeNode> {
  return httpClient.request(
    { method: "GET", url: `app/files/${appId}` },
    agentFileTreeNodeSchema,
  );
}

export async function writeAgentFile(
  appId: AppId,
  request: AgentFileWriteRequest,
): Promise<AgentFileMutationResponse> {
  return httpClient.request(
    {
      method: "PUT",
      url: `app/files/${appId}/file`,
      body: agentFileWriteRequestSchema.parse(request),
    },
    agentFileMutationResponseSchema,
  );
}

export async function createAgentDirectory(
  appId: AppId,
  request: AgentDirectoryCreateRequest,
): Promise<AgentFileMutationResponse> {
  return httpClient.request(
    {
      method: "POST",
      url: `app/files/${appId}/directory`,
      body: agentDirectoryCreateRequestSchema.parse(request),
    },
    agentFileMutationResponseSchema,
  );
}

export async function renameAgentEntry(
  appId: AppId,
  request: AgentFileRenameRequest,
): Promise<AgentFileMutationResponse> {
  return httpClient.request(
    {
      method: "POST",
      url: `app/files/${appId}/rename`,
      body: agentFileRenameRequestSchema.parse(request),
    },
    agentFileMutationResponseSchema,
  );
}

export async function deleteAgentEntry(
  appId: AppId,
  request: AgentFileDeleteRequest,
): Promise<AgentFileMutationResponse> {
  return httpClient.request(
    {
      method: "DELETE",
      url: `app/files/${appId}/entry`,
      body: agentFileDeleteRequestSchema.parse(request),
    },
    agentFileMutationResponseSchema,
  );
}

/** Narrow a mutation response to its optimistic-concurrency conflict variant. */
export function isAgentFileConflictResponse(
  response: AgentFileMutationResponse,
): response is Extract<AgentFileMutationResponse, { status: "conflict" }> {
  return response.status === "conflict";
}

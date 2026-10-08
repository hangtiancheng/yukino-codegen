import type { AppId } from "@/shared/schemas";

export type EndpointPaths = {
  readonly awesomeAppList: string;
  readonly appChatHistory: (appId: AppId) => string;
  readonly adminChatHistoryList: string;
  readonly chatStream: string;
};

const endpointPaths = {
  awesomeAppList: "app/awesome/list/page/vo",
  appChatHistory: (appId: AppId) => `chat-history/app/${appId}`,
  adminChatHistoryList: "chat-history/admin/list/page/vo",
  chatStream: "app/chat/codegen",
} satisfies EndpointPaths;

export function getEndpointPaths(): EndpointPaths {
  return endpointPaths;
}

export function resolveEndpointPaths(): EndpointPaths {
  return endpointPaths;
}

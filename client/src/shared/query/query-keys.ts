import type {
  AppId,
  AppQueryRequest,
  ChatHistoryQueryRequest,
  UserQueryRequest,
} from "@/shared/schemas";

export const queryKeys = {
  user: {
    all: ["user"] as const,
    current: ["user", "current"] as const,
    listPage: (params: UserQueryRequest) => ["user", "list", params] as const,
  },
  app: {
    all: ["app"] as const,
    byId: (id: AppId) => ["app", "byId", id] as const,
    myList: (params: AppQueryRequest) => ["app", "my", params] as const,
    awesomeList: (params: AppQueryRequest) =>
      ["app", "awesome", params] as const,
    adminList: (params: AppQueryRequest) => ["app", "admin", params] as const,
  },
  chatHistory: {
    all: ["chatHistory"] as const,
    byApp: (appId: AppId) => ["chatHistory", "app", appId] as const,
    byAppPaged: (
      appId: AppId,
      params: { pageSize: number; lastCreateTime?: string },
    ) => ["chatHistory", "app", appId, params] as const,
    adminList: (params: ChatHistoryQueryRequest) =>
      ["chatHistory", "admin", params] as const,
  },
} as const;

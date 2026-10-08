import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  listAdminChatHistoryPage,
  listAppChatHistory,
  type ChatHistoryPage,
} from "@/shared/api";
import { type AppId, type ChatHistoryQueryRequest } from "@/shared/schemas";
import { queryKeys } from "../query-keys";

export type AppChatHistoryParams = {
  readonly current: number;
  readonly pageSize: number;
};

export function useAppChatHistoryPage(
  appId: AppId | undefined,
  params: AppChatHistoryParams,
): UseQueryResult<ChatHistoryPage> {
  return useQuery({
    queryKey: appId
      ? queryKeys.chatHistory.byAppPaged(appId, params)
      : ["chatHistory", "app", "disabled", params],
    queryFn: () => {
      if (!appId) {
        throw new Error("appId is required");
      }
      return listAppChatHistory(appId, params);
    },
    enabled: appId !== undefined,
  });
}

export function useAdminChatHistoryPage(
  params: ChatHistoryQueryRequest,
  enabled = true,
): UseQueryResult<ChatHistoryPage> {
  return useQuery({
    queryKey: queryKeys.chatHistory.adminList(params),
    queryFn: () => listAdminChatHistoryPage(params),
    enabled,
  });
}

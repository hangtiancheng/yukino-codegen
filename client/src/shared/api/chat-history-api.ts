import { z } from "zod";
import { getEndpointPaths } from "@/shared/config";
import { httpClient } from "./http-client-singleton";
import {
  chatHistorySchema,
  chatHistoryQueryRequestSchema,
  listAppChatHistoryParamsSchema,
  pageSchema,
  type AppId,
  type ChatHistoryQueryRequest,
  type ListAppChatHistoryParams,
} from "@/shared/schemas";

const pageChatHistorySchema = pageSchema(chatHistorySchema);

export type ChatHistoryPage = z.infer<typeof pageChatHistorySchema>;

export async function listAppChatHistory(
  appId: AppId,
  params: Omit<ListAppChatHistoryParams, "appId">,
): Promise<ChatHistoryPage> {
  const validated = listAppChatHistoryParamsSchema.parse({ appId, ...params });
  const endpoints = getEndpointPaths();
  return httpClient.request(
    {
      method: "GET",
      url: endpoints.appChatHistory(validated.appId),
      query: { current: validated.current, pageSize: validated.pageSize },
    },
    pageChatHistorySchema,
  );
}

export async function listAdminChatHistoryPage(
  body: ChatHistoryQueryRequest,
): Promise<ChatHistoryPage> {
  return httpClient.request(
    {
      method: "POST",
      url: getEndpointPaths().adminChatHistoryList,
      body: chatHistoryQueryRequestSchema.parse(body),
    },
    pageChatHistorySchema,
  );
}

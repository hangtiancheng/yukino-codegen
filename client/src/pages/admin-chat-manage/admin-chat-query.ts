import {
  appIdSchema,
  chatHistoryQueryRequestSchema,
  userIdSchema,
  type ChatHistoryQueryRequest,
  type ChatMessageType,
} from "@/shared/schemas";
import {
  optionalPositiveInteger,
  optionalTrimmed,
} from "../admin-shared/filter-value";

export const adminChatPageSize = 10;

export type AdminChatFilterValues = {
  readonly appId: string;
  readonly userId: string;
  readonly message: string;
  readonly messageType: ChatMessageType | "";
};

export const initialAdminChatFilters: AdminChatFilterValues = {
  appId: "",
  userId: "",
  message: "",
  messageType: "",
};

export function buildAdminChatQuery(
  filters: AdminChatFilterValues,
  pageNumber: number,
): ChatHistoryQueryRequest {
  const appId = optionalPositiveInteger(filters.appId);
  const userId = optionalPositiveInteger(filters.userId);
  return chatHistoryQueryRequestSchema.parse({
    current: pageNumber,
    pageSize: adminChatPageSize,
    sortField: "createTime",
    sortOrder: "descend",
    appId: appId === undefined ? undefined : appIdSchema.parse(appId),
    userId: userId === undefined ? undefined : userIdSchema.parse(userId),
    message: optionalTrimmed(filters.message),
    messageType: filters.messageType === "" ? undefined : filters.messageType,
  });
}

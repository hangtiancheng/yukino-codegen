import type { PageResponse } from "../common/index.js";
import { createPageResponse } from "../common/index.js";
import type { PrismaDatabaseClient } from "../database/index.js";
import type { Prisma } from "../generated/prisma/client.js";

export type ChatHistoryQuery = Readonly<{
  current: number;
  pageSize: number;
  appId?: bigint;
  userId?: bigint;
  message?: string;
  messageType?: "user" | "ai";
  beforeCreateTime?: Date;
  sortOrder?: "ascend" | "descend";
}>;

export type ChatHistoryVo = Readonly<{
  id: string;
  message: string;
  messageType: "user" | "ai";
  appId: string;
  userId: string;
  createTime: string;
}>;

const kindFor = (messageType: ChatHistoryQuery["messageType"]): string[] => {
  if (messageType === "user") return ["user_message"];
  if (messageType === "ai") return ["assistant_message"];
  return ["user_message", "assistant_message"];
};

const whereFor = (query: ChatHistoryQuery): Prisma.AgentTranscriptEventWhereInput => ({
  kind: { in: kindFor(query.messageType) },
  ...(query.beforeCreateTime !== undefined && {
    createTime: { lte: query.beforeCreateTime },
  }),
  ...(query.message !== undefined && {
    payload: { path: ["text"], string_contains: query.message },
  }),
  session: {
    workspace: {
      ...(query.appId !== undefined && { appId: query.appId }),
      ...(query.userId !== undefined && { userId: query.userId }),
    },
  },
});

const textFromPayload = (payload: unknown): string => {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return "";
  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
};

export const listChatHistory = async (
  db: PrismaDatabaseClient,
  query: ChatHistoryQuery,
): Promise<PageResponse<ChatHistoryVo>> => {
  const where = whereFor(query);
  const [rows, total] = await Promise.all([
    db.agentTranscriptEvent.findMany({
      orderBy: { createTime: query.sortOrder === "ascend" ? "asc" : "desc" },
      skip: (query.current - 1) * query.pageSize,
      take: query.pageSize,
      where,
      select: {
        createTime: true,
        id: true,
        kind: true,
        payload: true,
        session: {
          select: {
            workspace: { select: { appId: true, userId: true } },
          },
        },
      },
    }),
    db.agentTranscriptEvent.count({ where }),
  ]);

  return createPageResponse(
    rows.map((row) => ({
      appId: row.session.workspace.appId.toString(),
      createTime: row.createTime.toISOString(),
      id: row.id.toString(),
      message: textFromPayload(row.payload),
      messageType: row.kind === "user_message" ? "user" : "ai",
      userId: row.session.workspace.userId.toString(),
    })),
    query,
    total,
  );
};

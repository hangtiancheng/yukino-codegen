import { z } from "zod";
import { appIdSchema, chatHistoryIdSchema, userIdSchema } from "./branded-ids";
import { isoTimestampSchema, positiveIntSchema } from "./primitives";

const canonicalChatMessageTypeSchema = z.enum(["user", "ai"]);

const backendChatMessageTypeSchema = z
  .enum(["USER", "AI"])
  .transform((value) => value.toLowerCase())
  .pipe(canonicalChatMessageTypeSchema);

export const chatMessageTypeSchema = z.union([
  canonicalChatMessageTypeSchema,
  backendChatMessageTypeSchema,
]);
export type ChatMessageType = z.infer<typeof chatMessageTypeSchema>;

export const chatHistorySchema = z.object({
  id: chatHistoryIdSchema,
  message: z.string(),
  messageType: chatMessageTypeSchema,
  appId: appIdSchema,
  userId: userIdSchema,
  createTime: isoTimestampSchema,
  updateTime: isoTimestampSchema.optional(),
});

export type ChatHistory = z.infer<typeof chatHistorySchema>;

export const listAppChatHistoryParamsSchema = z.object({
  appId: appIdSchema,
  current: positiveIntSchema.default(1),
  pageSize: positiveIntSchema.default(10),
});

export type ListAppChatHistoryParams = z.infer<
  typeof listAppChatHistoryParamsSchema
>;

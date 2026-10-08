import { z } from "zod";
import { appIdSchema, userIdSchema } from "./branded-ids";
import { chatMessageTypeSchema } from "./chat-history";
import { paginationQuerySchema } from "./pagination";
import { isoTimestampSchema } from "./primitives";
import { userRoleSchema } from "./user-role";

export const userQueryRequestSchema = paginationQuerySchema.extend({
  id: userIdSchema.optional(),
  username: z.string().optional(),
  userAccount: z.string().optional(),
  userProfile: z.string().optional(),
  userRole: userRoleSchema.optional(),
});

export const appQueryRequestSchema = paginationQuerySchema.extend({
  id: appIdSchema.optional(),
  appName: z.string().optional(),
  initPrompt: z.string().optional(),
  userId: userIdSchema.optional(),
  priority: z.number().int().nonnegative().optional(),
});

export const chatHistoryQueryRequestSchema = paginationQuerySchema.extend({
  appId: appIdSchema.optional(),
  userId: userIdSchema.optional(),
  message: z.string().optional(),
  messageType: chatMessageTypeSchema.optional(),
  lastCreateTime: isoTimestampSchema.optional(),
});

export type UserQueryRequest = z.infer<typeof userQueryRequestSchema>;
export type AppQueryRequest = z.infer<typeof appQueryRequestSchema>;
export type ChatHistoryQueryRequest = z.infer<
  typeof chatHistoryQueryRequestSchema
>;

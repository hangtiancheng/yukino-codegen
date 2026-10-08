import { z } from "zod";
import { appIdSchema, userIdSchema } from "./branded-ids";
import { isoTimestampSchema, nonNegativeIntSchema } from "./primitives";
import { userVoSchema } from "./user";

const appCoverValueSchema = z.string().url().nullable();

const appVoBaseSchema = z.object({
  id: appIdSchema,
  appName: z.string().min(1),
  initPrompt: z.string().min(1),
  priority: nonNegativeIntSchema.optional(),
  userId: userIdSchema,
  createTime: isoTimestampSchema.optional(),
  updateTime: isoTimestampSchema.optional(),
  user: userVoSchema.optional(),
});

export const appVoSchema = appVoBaseSchema.extend({
  appCover: appCoverValueSchema.optional(),
});

export type AppVo = z.infer<typeof appVoSchema>;

export const appAddRequestSchema = z.object({
  initPrompt: z.string().min(1).max(1000),
});

export const appUpdateRequestSchema = z.object({
  id: appIdSchema,
  appName: z.string().min(1).max(120).optional(),
});

export const appAdminUpdateRequestSchema = z.object({
  id: appIdSchema,
  appName: z.string().min(1).max(120).optional(),
  appCover: z.string().url().optional(),
  priority: nonNegativeIntSchema.optional(),
});

export const appDeleteRequestSchema = z.object({
  id: appIdSchema,
});

export type AppAddRequest = z.infer<typeof appAddRequestSchema>;
export type AppUpdateRequest = z.infer<typeof appUpdateRequestSchema>;
export type AppAdminUpdateRequest = z.infer<typeof appAdminUpdateRequestSchema>;
export type AppDeleteRequest = z.infer<typeof appDeleteRequestSchema>;

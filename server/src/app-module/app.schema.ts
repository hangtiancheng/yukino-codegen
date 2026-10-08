import { z } from "zod";
import { idSchema } from "../common/id.schema.js";
import { promptSchema } from "../common/index.js";
import { pageRequestSchema } from "../common/pagination.schema.js";

export const appEntitySchema = z.object({
  appCover: z.string().nullable(),
  appName: z.string().nullable(),
  createTime: z.date(),
  id: z.bigint(),
  initPrompt: z.string().nullable(),
  priority: z.number().int(),
  updateTime: z.date(),
  userId: z.bigint(),
});

export const appVoSchema = z.object({
  appCover: z.string().nullable(),
  appName: z.string().nullable(),
  createTime: z.date(),
  id: z.string(),
  initPrompt: z.string().nullable(),
  priority: z.number().int(),
  updateTime: z.date(),
  userId: z.string(),
});

export const appAddSchema = z.object({
  initPrompt: promptSchema,
});

export const appUpdateSchema = z.object({
  appName: z.string().min(1).max(256).optional(),
  id: idSchema,
});

export const appDownloadParamSchema = z.object({
  appId: idSchema,
});

export const appIdQuerySchema = z.object({ id: idSchema });

export const appIdBodySchema = z.object({ id: idSchema });

export const appChatCodegenQuerySchema = z.object({
  appId: idSchema,
  message: promptSchema,
});

export const appAdminUpdateSchema = z.object({
  appCover: z.string().max(512).optional(),
  appName: z.string().min(1).max(256).optional(),
  id: idSchema,
  priority: z.number().int().min(0).max(99).optional(),
});

export const appPageQuerySchema = pageRequestSchema.extend({
  appName: z.string().min(1).max(256).optional(),
  id: idSchema.optional(),
  initPrompt: promptSchema.optional(),
  priority: z.number().int().min(0).max(99).optional(),
  userId: idSchema.optional(),
});

export type AppEntity = z.infer<typeof appEntitySchema>;
export type AppVo = z.infer<typeof appVoSchema>;
export type AppAddRequest = z.infer<typeof appAddSchema>;
export type AppUpdateRequest = z.infer<typeof appUpdateSchema>;
export type AppChatCodegenQuery = z.infer<typeof appChatCodegenQuerySchema>;
export type AppDownloadParam = z.infer<typeof appDownloadParamSchema>;
export type AppAdminUpdateRequest = z.infer<typeof appAdminUpdateSchema>;
export type AppPageQuery = z.infer<typeof appPageQuerySchema>;

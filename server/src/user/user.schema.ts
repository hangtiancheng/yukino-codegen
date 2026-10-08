import { z } from "zod";
import { idSchema } from "../common/id.schema.js";
import { pageRequestSchema } from "../common/pagination.schema.js";
import { UserRole } from "../generated/prisma/enums.js";

export const userRoleSchema = z.enum(UserRole);

export const userEntitySchema = z.object({
  createTime: z.date(),
  id: z.bigint(),
  updateTime: z.date(),
  userAccount: z.string(),
  userAvatar: z.string().nullable(),
  username: z.string().nullable(),
  userProfile: z.string().nullable(),
  userRole: userRoleSchema,
});

export const userVoSchema = z.object({
  createTime: z.date(),
  id: z.string(),
  userAccount: z.string(),
  userAvatar: z.string().nullable(),
  username: z.string().nullable(),
  userProfile: z.string().nullable(),
  userRole: userRoleSchema,
});

export const loginUserVoSchema = userVoSchema.omit({ createTime: true });

export const adminUserSchema = userVoSchema.extend({
  editTime: z.date(),
  isDelete: z.boolean(),
  updateTime: z.date(),
  userPassword: z.string(),
});

export const userRegisterSchema = z
  .object({
    checkPassword: z.string().min(8).max(128),
    userAccount: z.string().min(4).max(256),
    userPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.userPassword === data.checkPassword, {
    message: "The two passwords do not match",
    path: ["checkPassword"],
  });

export const userLoginSchema = z.object({
  userAccount: z.string().min(4).max(256),
  userPassword: z.string().min(8).max(128),
});

export const userAddSchema = z.object({
  userAccount: z.string().min(4).max(256),
  userAvatar: z.string().max(1024).optional(),
  username: z.string().min(1).max(256).optional(),
  userPassword: z.string().min(8).max(128),
  userRole: userRoleSchema.optional(),
});

export const userUpdateSchema = z.object({
  id: idSchema,
  userAvatar: z.string().max(1024).optional(),
  username: z.string().min(1).max(256).optional(),
  userProfile: z.string().max(512).optional(),
  userRole: userRoleSchema.optional(),
});

export const userIdQuerySchema = z.object({ id: idSchema });

export const userIdBodySchema = z.object({ id: idSchema });

export const userPageQuerySchema = pageRequestSchema.extend({
  id: idSchema.optional(),
  userAccount: z.string().min(1).max(256).optional(),
  username: z.string().min(1).max(256).optional(),
  userProfile: z.string().min(1).max(512).optional(),
  userRole: userRoleSchema.optional(),
});

export type UserEntity = z.infer<typeof userEntitySchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type UserVo = z.infer<typeof userVoSchema>;
export type LoginUserVo = z.infer<typeof loginUserVoSchema>;
export type UserRegisterRequest = z.infer<typeof userRegisterSchema>;
export type UserLoginRequest = z.infer<typeof userLoginSchema>;
export type UserAddRequest = z.infer<typeof userAddSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateSchema>;
export type UserPageQuery = z.infer<typeof userPageQuerySchema>;

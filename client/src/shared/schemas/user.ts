import { z } from "zod";
import { userIdSchema } from "./branded-ids";
import { isoTimestampSchema } from "./primitives";
import { userRoleSchema } from "./user-role";

export const userVoSchema = z.object({
  id: userIdSchema,
  userAccount: z.string().min(1),
  username: z.string().nullable().optional(),
  userAvatar: z.string().url().nullable().optional(),
  userProfile: z.string().nullable().optional(),
  userRole: userRoleSchema,
  createTime: isoTimestampSchema.optional(),
});

export const loginUserVoSchema = userVoSchema.extend({
  updateTime: isoTimestampSchema.optional(),
});

export type UserVo = z.infer<typeof userVoSchema>;
export type LoginUserVo = z.infer<typeof loginUserVoSchema>;

export const userLoginRequestSchema = z.object({
  userAccount: z.string().min(4),
  userPassword: z.string().min(8),
});

export const userRegisterRequestSchema = z
  .object({
    userAccount: z.string().min(4),
    userPassword: z.string().min(8),
    checkPassword: z.string().min(8),
  })
  .refine((value) => value.userPassword === value.checkPassword, {
    message: "passwords must match",
    path: ["checkPassword"],
  });

export const userUpdateRequestSchema = z.object({
  id: userIdSchema,
  username: z.string().min(1).optional(),
  userAvatar: z.string().url().optional(),
  userProfile: z.string().optional(),
  userRole: userRoleSchema.optional(),
});

export const userDeleteRequestSchema = z.object({
  id: userIdSchema,
});

export type UserLoginRequest = z.infer<typeof userLoginRequestSchema>;
export type UserRegisterRequest = z.infer<typeof userRegisterRequestSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateRequestSchema>;
export type UserDeleteRequest = z.infer<typeof userDeleteRequestSchema>;

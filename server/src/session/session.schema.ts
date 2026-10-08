import { z } from "zod";
import { userRoleSchema } from "../user/user.schema.js";

export const sessionPayloadSchema = z.object({
  expiresAt: z.number().int().min(0),
  user: z.object({
    id: z.string().regex(/^[1-9][0-9]*$/u),
    userAccount: z.string(),
    userAvatar: z.string().nullable(),
    username: z.string().nullable(),
    userProfile: z.string().nullable(),
    userRole: userRoleSchema,
  }),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;
export type SessionUser = SessionPayload["user"];

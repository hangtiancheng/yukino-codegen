import { z } from "zod";
import { appIdSchema } from "./branded-ids";

export const numericIdParamSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    if (!/^[1-9]\d*$/u.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "route id must be a positive integer",
      });
      return z.NEVER;
    }
    return value;
  });

export const appChatRouteParamsSchema = z.object({
  id: appIdSchema,
});

export const appEditRouteParamsSchema = z.object({
  id: appIdSchema,
});

export type AppChatRouteParams = z.infer<typeof appChatRouteParamsSchema>;
export type AppEditRouteParams = z.infer<typeof appEditRouteParamsSchema>;

import { z } from "zod";

export const idStringSchema = z.string().regex(/^[1-9]\d*$/);
const idNumberSchema = z
  .number()
  .int()
  .positive()
  .refine((value) => Number.isSafeInteger(value), {
    message: "ID number must be a safe integer",
  })
  .transform((value) => String(value));
const idBigIntSchema = z
  .bigint()
  .refine((value) => value > 0n, { message: "ID must be positive" })
  .transform((value) => value.toString());

export const userIdSchema = z
  .union([idStringSchema, idNumberSchema, idBigIntSchema])
  .pipe(idStringSchema)
  .brand<"UserId">();
export type UserId = z.infer<typeof userIdSchema>;

export const appIdSchema = z
  .union([idStringSchema, idNumberSchema, idBigIntSchema])
  .pipe(idStringSchema)
  .brand<"AppId">();
export type AppId = z.infer<typeof appIdSchema>;

export const chatHistoryIdSchema = z
  .union([idStringSchema, idNumberSchema, idBigIntSchema])
  .pipe(idStringSchema)
  .brand<"ChatHistoryId">();
export type ChatHistoryId = z.infer<typeof chatHistoryIdSchema>;

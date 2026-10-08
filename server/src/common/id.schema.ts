import { z } from "zod";

export const idStringSchema = z.string().regex(/^[1-9][0-9]*$/u);
const idNumberSchema = z
  .number()
  .int()
  .positive()
  .refine((value) => Number.isSafeInteger(value), {
    message: "ID number must be a safe integer",
  });
const idBigIntSchema = z.bigint().refine((value) => value > 0n, {
  message: "ID must be positive",
});

export const idSchema = z.union([
  idBigIntSchema,
  idNumberSchema.transform((value) => BigInt(value)),
  idStringSchema.transform((value) => BigInt(value)),
]);

export type EntityId = z.infer<typeof idSchema>;

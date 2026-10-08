import { z } from "zod";

export const successCode = 0;

export function baseResponseSchema<TData extends z.ZodTypeAny>(
  data: TData,
): z.ZodObject<{
  code: z.ZodNumber;
  data: TData;
  message: z.ZodOptional<z.ZodString>;
}> {
  return z.object({
    code: z.number().int(),
    data,
    message: z.string().optional(),
  });
}

export const businessErrorResponseSchema = z.object({
  code: z.number().int(),
  message: z.string().min(1),
  data: z.unknown().optional(),
});

export type BusinessErrorResponse = z.infer<typeof businessErrorResponseSchema>;

export function isSuccessCode(code: number): boolean {
  return code === successCode;
}

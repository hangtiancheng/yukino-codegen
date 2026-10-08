import { z } from "zod";

export function getZodFieldError(
  schema: z.ZodType<string>,
  value: string,
  visible: boolean,
): string | undefined {
  if (!visible) {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return undefined;
  }
  return result.error.issues[0]?.message;
}

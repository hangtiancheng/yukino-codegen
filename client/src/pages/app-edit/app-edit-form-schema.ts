import { z } from "zod";
import { type AppVo } from "@/shared/schemas";

export const appCoverInputSchema = z
  .string()
  .url("Please enter a valid URL")
  .or(z.literal(""));

export const appEditFormSchema = z.object({
  appName: z.string().min(1, "Please enter app name").max(120),
  appCover: appCoverInputSchema,
  priority: z.number().int().min(0).max(99),
});

export type AppEditFormValues = z.infer<typeof appEditFormSchema>;

export function toAppEditFormValues(app: AppVo): AppEditFormValues {
  return {
    appName: app.appName,
    appCover: app.appCover ?? "",
    priority: app.priority ?? 0,
  };
}

export function optionalCover(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

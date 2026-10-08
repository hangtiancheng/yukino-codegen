import { z } from "zod";
import { getApiBaseUrl } from "@/shared/config";
import { appIdSchema, type AppId } from "@/shared/schemas";
import { buildUrl, readResponse } from "./http-request";

const filenameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.zip$/);

export async function downloadAppCode(appId: AppId): Promise<void> {
  const id = appIdSchema.parse(appId);
  const response = await fetch(
    buildUrl(getApiBaseUrl(), {
      method: "GET",
      url: `app/download/${id}`,
    }),
    { credentials: "include" },
  );
  if (!response.ok) {
    const envelope = await readResponse(response);
    throw new Error(`download failed: ${envelope.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filenameSchema.parse(`app-${id}.zip`));
  URL.revokeObjectURL(url);
}

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

import { z } from "zod";
import { httpClient } from "@/shared/api/http-client-singleton";
import type { AppId } from "@/shared/schemas";

const previewStateSchema = z.object({
  status: z.enum(["idle", "installing", "building", "ready", "failed"]),
  logs: z.string(),
  revision: z.number(),
  error: z.string().optional(),
  url: z.string().url().optional(),
});
export type ServerPreviewState = z.infer<typeof previewStateSchema>;

export function fetchPreviewState(
  appId: AppId,
  build = false,
  signal?: AbortSignal,
) {
  return httpClient.request(
    {
      method: build ? "POST" : "GET",
      url: `app/${appId}/workspace/preview`,
      ...(signal === undefined ? {} : { signal }),
    },
    previewStateSchema,
  );
}

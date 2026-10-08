import { toast } from "sonner";
import { downloadAppCode } from "@/shared/api";
import { type AppVo } from "@/shared/schemas";

export function handleChatDownload(
  app: AppVo,
  setDownloading: (value: boolean) => void,
): void {
  setDownloading(true);
  void downloadAppCode(app.id)
    .catch(() => toast.error("Download failed"))
    .finally(() => setDownloading(false));
}

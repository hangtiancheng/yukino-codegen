import { Download } from "lucide-react";
import { type ReactNode } from "react";
import { LoadingButton } from "@/shared/ui";

export type AppEditToolbarProps = {
  readonly downloading: boolean;
  readonly onDownload: () => void;
};

export function AppEditToolbar({
  downloading,
  onDownload,
}: AppEditToolbarProps): ReactNode {
  return (
    <section className="border-border/80 bg-primary/5 flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5">
      <LoadingButton
        variant="secondary"
        size="sm"
        onClick={onDownload}
        isLoading={downloading}
      >
        <Download className="size-4" aria-hidden="true" />
        Download Code
      </LoadingButton>
      <p className="text-muted-foreground text-xs">
        Export the generated project as a zip archive.
      </p>
    </section>
  );
}

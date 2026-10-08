import { Download, Info, Pencil } from "lucide-react";
import { type ReactNode } from "react";
import { type AppVo } from "@/shared/schemas";
import { Button, LoadingButton } from "@/shared/ui";

export type ChatHeaderProps = {
  readonly app: AppVo;
  readonly canManage: boolean;
  readonly downloading: boolean;
  readonly onDetails: () => void;
  readonly onEdit: () => void;
  readonly onDownload: () => void;
};

export function ChatHeader({
  app,
  canManage,
  downloading,
  onDetails,
  onEdit,
  onDownload,
}: ChatHeaderProps): ReactNode {
  return (
    <header className="border-border/80 bg-card shadow-soft flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="from-primary to-primary/70 shadow-primary/20 grid size-7 shrink-0 place-items-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white shadow-sm"
          aria-hidden="true"
        >
          {app.appName.trim().charAt(0).toUpperCase() || "A"}
        </span>
        <h1 className="text-foreground min-w-0 truncate text-sm font-semibold">
          {app.appName}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onDetails}>
          <Info className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Details</span>
        </Button>
        {canManage ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        ) : null}
        <LoadingButton
          size="sm"
          disabled={!canManage}
          isLoading={downloading}
          onClick={onDownload}
        >
          <Download className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Download</span>
        </LoadingButton>
      </div>
    </header>
  );
}

import { Edit, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { formatDateTime } from "@/shared/lib";
import { type AppVo } from "@/shared/schemas";
import { Button } from "./button";
import { ConfirmationDialog } from "./confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { UserInfo } from "./user-info";

export type AppDetailModalProps = {
  readonly open: boolean;
  readonly app?: AppVo | undefined;
  readonly showActions?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
};

export function AppDetailModal({
  open,
  app,
  showActions = false,
  onOpenChange,
  onEdit,
  onDelete,
}: AppDetailModalProps): ReactNode {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>App Details</DialogTitle>
          </DialogHeader>
          <dl className="grid gap-4 text-sm">
            <InfoRow label="Creator">
              <UserInfo user={app?.user} size="sm" />
            </InfoRow>
            <InfoRow label="Created">{formatDateTime(app?.createTime)}</InfoRow>
          </dl>
          {showActions ? (
            <DialogFooter className="border-border border-t pt-4">
              <Button onClick={onEdit}>
                <Edit data-icon="inline-start" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={confirmOpen}
        title="Delete app?"
        description="This action cannot be undone. The app will be permanently removed."
        confirmLabel="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete?.();
        }}
      />
    </>
  );
}

function InfoRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground min-w-0">{children}</dd>
    </div>
  );
}

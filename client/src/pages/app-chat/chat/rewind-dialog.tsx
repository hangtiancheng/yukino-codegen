import { History } from "lucide-react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import type { AgentRewindSnapshot } from "../use-agent-transcript";
import type { AgentRewindChoice } from "@/shared/schemas";

export type RewindDialogProps = {
  readonly snapshots: ReadonlyArray<AgentRewindSnapshot> | undefined;
  readonly onAction: (sha: string, action: AgentRewindChoice) => void;
  readonly onClose: () => void;
};

/**
 * Remote parity: /rewind lists git checkpoints; each snapshot can restore
 * code, the conversation, or both.
 */
export function RewindDialog({
  snapshots,
  onAction,
  onClose,
}: RewindDialogProps): ReactNode {
  return (
    <Dialog
      open={snapshots !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="text-primary size-5" aria-hidden="true" />
            Rewind to a checkpoint
          </DialogTitle>
          <DialogDescription>
            Snapshots are taken after every completed turn.
          </DialogDescription>
        </DialogHeader>
        {snapshots === undefined ? null : snapshots.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No checkpoints yet.
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.sha}
                className="border-border/70 flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {snapshot.message}
                  </p>
                  <p className="text-muted-foreground font-mono text-[11px]">
                    {snapshot.sha.slice(0, 10)} · {snapshot.date}
                  </p>
                </div>
                {snapshot.conversation ? (
                  <Badge variant="secondary">conversation</Badge>
                ) : null}
                <div className="flex gap-1.5">
                  {snapshot.conversation ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onAction(snapshot.sha, "code_and_conversation")
                        }
                      >
                        Code + chat
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onAction(snapshot.sha, "conversation_only")
                        }
                      >
                        Chat only
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onAction(snapshot.sha, "code_only")}
                  >
                    Code only
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

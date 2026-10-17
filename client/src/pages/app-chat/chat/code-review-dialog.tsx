import { ScanSearch } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  TextArea,
} from "@/shared/ui";
import type { AgentCodeReviewProgress } from "../use-agent-transcript";
import type { CodeReviewStartInput } from "../use-agent-socket";

export type CodeReviewDialogProps = {
  readonly open: boolean;
  readonly progress: AgentCodeReviewProgress | undefined;
  readonly onRun: (options: CodeReviewStartInput) => void;
  readonly onClose: () => void;
};

/**
 * Remote parity: /code-review opens a form for the review scope; progress
 * events stream into the dialog while the review runs.
 */
export function CodeReviewDialog({
  open,
  progress,
  onRun,
  onClose,
}: CodeReviewDialogProps): ReactNode {
  const [background, setBackground] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [commit, setCommit] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const running = progress !== undefined && progress.phase !== "done";

  const submit = (): void => {
    const patterns = excludePatterns
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    onRun({
      ...(background.trim().length > 0 && { background: background.trim() }),
      ...(from.trim().length > 0 && { from: from.trim() }),
      ...(to.trim().length > 0 && { to: to.trim() }),
      ...(commit.trim().length > 0 && { commit: commit.trim() }),
      ...(patterns.length > 0 && { excludePatterns: patterns }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !running && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="text-primary size-5" aria-hidden="true" />
            Code review
          </DialogTitle>
          <DialogDescription>
            Leave refs empty to review the uncommitted working tree.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <TextArea
            value={background}
            onChange={(event) => setBackground(event.target.value)}
            placeholder="Focus / background for the review (optional)"
            rows={2}
            className="resize-none text-sm"
            disabled={running}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="from ref (e.g. HEAD~3)"
              className="font-mono text-xs"
              disabled={running}
            />
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="to ref (e.g. HEAD)"
              className="font-mono text-xs"
              disabled={running}
            />
          </div>
          <Input
            value={commit}
            onChange={(event) => setCommit(event.target.value)}
            placeholder="single commit sha (range mode alternative)"
            className="font-mono text-xs"
            disabled={running}
          />
          <TextArea
            value={excludePatterns}
            onChange={(event) => setExcludePatterns(event.target.value)}
            placeholder={"Exclude globs, one per line (e.g. pnpm-lock.yaml)"}
            rows={2}
            className="resize-none font-mono text-xs"
            disabled={running}
          />
          {progress !== undefined ? (
            <div className="bg-muted/40 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs">
              {running ? <Spinner className="size-3.5" /> : null}
              <span className="text-muted-foreground font-mono">
                [{progress.phase}]
              </span>
              <span className="min-w-0 flex-1 truncate">
                {progress.message}
              </span>
              {progress.progress !== undefined ? (
                <span className="text-muted-foreground">
                  {Math.round(progress.progress * 100)}%
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button onClick={submit} disabled={running}>
            {running ? "Reviewing…" : "Run review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

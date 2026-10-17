import { ClipboardCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextArea,
} from "@/shared/ui";
import type { AgentPlanApproval } from "../use-agent-transcript";
import type { AgentPlanChoice } from "@/shared/schemas";

export type PlanApprovalDialogProps = {
  readonly request: AgentPlanApproval | undefined;
  readonly onChoose: (choice: AgentPlanChoice, feedback?: string) => void;
};

/**
 * Remote parity: after a plan-mode run whose ExitPlanMode succeeded the server
 * asks the user to approve the written plan. "yolo" auto-approves every later
 * edit, "manual" restores per-edit confirmation, and "feedback" keeps planning.
 */
export function PlanApprovalDialog({
  request,
  onChoose,
}: PlanApprovalDialogProps): ReactNode {
  const [feedback, setFeedback] = useState("");
  return (
    <Dialog open={request !== undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        {request === undefined ? null : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck
                  className="text-primary size-5"
                  aria-hidden="true"
                />
                Approve the plan
              </DialogTitle>
              <DialogDescription className="truncate">
                {request.planPath.length > 0
                  ? request.planPath
                  : "The agent finished planning and is waiting for approval."}
              </DialogDescription>
            </DialogHeader>
            <pre className="border-border bg-muted/40 text-muted-foreground max-h-72 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap">
              {request.planContent.length > 0
                ? request.planContent
                : "(plan file is empty)"}
            </pre>
            <TextArea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Optional feedback to keep planning…"
              aria-label="Plan feedback"
              rows={2}
              className="resize-none text-sm"
            />
            <DialogFooter className="flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                disabled={feedback.trim().length === 0}
                onClick={() => {
                  onChoose("feedback", feedback.trim());
                  setFeedback("");
                }}
              >
                Send feedback
              </Button>
              <Button variant="outline" onClick={() => onChoose("manual")}>
                Approve (confirm edits)
              </Button>
              <Button onClick={() => onChoose("yolo")}>
                Approve &amp; auto-apply
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

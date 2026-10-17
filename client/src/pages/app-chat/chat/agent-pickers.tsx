import { Brain, Check, Cpu } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@/shared/ui";
import type {
  AgentModelList,
  AgentThinkingForm,
} from "../use-agent-transcript";

export type ModelPickerProps = {
  readonly state: AgentModelList | undefined;
  readonly onSelect: (model: string) => void;
  readonly onClose: () => void;
};

/** Remote parity: /model broadcasts the discovered model list for picking. */
export function ModelPicker({
  state,
  onSelect,
  onClose,
}: ModelPickerProps): ReactNode {
  return (
    <Dialog
      open={state !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="text-primary size-5" aria-hidden="true" />
            Select model
          </DialogTitle>
          <DialogDescription>
            Models discovered from the configured provider.
          </DialogDescription>
        </DialogHeader>
        {state === undefined ? null : state.status === "loading" ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
            <Spinner className="size-4" />
            Discovering models…
          </div>
        ) : state.status === "error" ? (
          <p className="text-destructive py-4 text-center text-sm">
            Model discovery failed.
          </p>
        ) : state.status === "empty" ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            The provider did not return any models.
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-auto pr-1">
            {state.models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelect(model.id)}
                className={cn(
                  "hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                  model.id === state.current && "bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {model.name ?? model.id}
                </span>
                {model.id === state.current ? (
                  <Check
                    className="text-primary size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type ThinkingPickerProps = {
  readonly form: AgentThinkingForm | undefined;
  readonly onSelect: (level: string) => void;
  readonly onClose: () => void;
};

/** Remote parity: bare /thinking opens the level picker. */
export function ThinkingPicker({
  form,
  onSelect,
  onClose,
}: ThinkingPickerProps): ReactNode {
  return (
    <Dialog
      open={form !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="text-primary size-5" aria-hidden="true" />
            Thinking level
          </DialogTitle>
          <DialogDescription>
            How much reasoning the model spends per turn.
          </DialogDescription>
        </DialogHeader>
        {form === undefined ? null : (
          <div className="space-y-1">
            {form.levels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onSelect(level)}
                className={cn(
                  "hover:bg-accent flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm capitalize",
                  level === form.current && "bg-accent/60",
                )}
              >
                <span className="flex-1">{level}</span>
                {level === form.current ? (
                  <Check className="text-primary size-4" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

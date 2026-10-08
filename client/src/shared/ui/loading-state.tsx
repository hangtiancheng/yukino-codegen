import { type ReactNode } from "react";
import { cn } from "cn";
import { Spinner } from "@/shared/ui/spinner";

export type LoadingStateProps = {
  readonly label?: string;
  readonly className?: string;
};

export function LoadingState({
  label = "Loading content",
  className,
}: LoadingStateProps): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm",
        className,
      )}
    >
      <Spinner className="text-primary size-6" />
      <span>{label}</span>
    </div>
  );
}

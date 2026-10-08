import { type ReactNode } from "react";
import { Spinner } from "@/shared/ui/spinner";

export function PageLoader(): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="text-muted-foreground flex min-h-[40vh] w-full flex-col items-center justify-center gap-2 text-sm"
    >
      <Spinner className="text-primary size-5" />
      <span>Loading…</span>
    </div>
  );
}

import type { ReactNode } from "react";

type RootErrorFallbackProps = {
  readonly error: Error;
};

export function RootErrorFallback({
  error,
}: RootErrorFallbackProps): ReactNode {
  return (
    <div
      role="alert"
      className="bg-background flex h-full w-full items-center justify-center p-8"
    >
      <div className="border-border bg-card max-w-md rounded-lg border p-6 shadow-sm">
        <h1 className="text-foreground mb-2 text-xl font-semibold">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </div>
    </div>
  );
}

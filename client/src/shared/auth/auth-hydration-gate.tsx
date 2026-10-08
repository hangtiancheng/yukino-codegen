import { useEffect, type ReactNode } from "react";
import { useUserStore } from "./user-store";

export type AuthHydrationGateProps = {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
};

export function AuthHydrationGate({
  children,
  fallback,
}: AuthHydrationGateProps): ReactNode {
  const status = useUserStore((state) => state.status);
  const hydrate = useUserStore((state) => state.hydrate);

  useEffect(() => {
    if (status === "idle") {
      void hydrate();
    }
  }, [status, hydrate]);

  if (status === "idle" || status === "loading") {
    return fallback ?? null;
  }
  return children;
}

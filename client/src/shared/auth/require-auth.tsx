import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { selectIsAuthenticated, useUserStore } from "./user-store";

export type RequireAuthProps = {
  readonly children: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps): ReactNode {
  const isAuthenticated = useUserStore(selectIsAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/user/login?redirect=${redirect}`} replace />;
  }
  return children;
}

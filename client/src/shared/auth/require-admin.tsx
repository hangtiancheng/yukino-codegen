import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import {
  selectIsAdmin,
  selectIsAuthenticated,
  useUserStore,
} from "./user-store";

export type RequireAdminProps = {
  readonly children: ReactNode;
};

export function RequireAdmin({ children }: RequireAdminProps): ReactNode {
  const isAuthenticated = useUserStore(selectIsAuthenticated);
  const isAdmin = useUserStore(selectIsAdmin);
  if (!isAuthenticated) {
    return <Navigate to="/user/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

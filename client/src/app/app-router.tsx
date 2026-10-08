import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "@/shared/auth";
import { BasicLayout } from "@/shared/layout";
import { PageLoader } from "@/shared/ui";
import { PageTransition } from "./page-transition";

const HomePage = lazy(() =>
  import("@/pages/home").then((module) => ({ default: module.HomePage })),
);
const UserLoginPage = lazy(() =>
  import("@/pages/user-login").then((module) => ({
    default: module.UserLoginPage,
  })),
);
const UserRegisterPage = lazy(() =>
  import("@/pages/user-register").then((module) => ({
    default: module.UserRegisterPage,
  })),
);
const AdminUserManagePage = lazy(() =>
  import("@/pages/admin-user-manage").then((module) => ({
    default: module.AdminUserManagePage,
  })),
);
const AdminAppManagePage = lazy(() =>
  import("@/pages/admin-app-manage").then((module) => ({
    default: module.AdminAppManagePage,
  })),
);
const AdminChatManagePage = lazy(() =>
  import("@/pages/admin-chat-manage").then((module) => ({
    default: module.AdminChatManagePage,
  })),
);
const AppChatPage = lazy(() =>
  import("@/pages/app-chat").then((module) => ({
    default: module.AppChatPage,
  })),
);
const AppEditPage = lazy(() =>
  import("@/pages/app-edit").then((module) => ({
    default: module.AppEditPage,
  })),
);

export function AppRouter(): ReactNode {
  return (
    <Suspense fallback={<PageLoader />}>
      <PageTransition>
        <Routes>
          <Route path="/" element={<BasicLayout />}>
            <Route index element={<HomePage />} />
            <Route
              path="admin/userManage"
              element={
                <RequireAdmin>
                  <Navigate to="/admin/user-manage" replace />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/appManage"
              element={
                <RequireAdmin>
                  <Navigate to="/admin/app-manage" replace />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/chatManage"
              element={
                <RequireAdmin>
                  <Navigate to="/admin/chat-manage" replace />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/user-manage"
              element={
                <RequireAdmin>
                  <AdminUserManagePage />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/app-manage"
              element={
                <RequireAdmin>
                  <AdminAppManagePage />
                </RequireAdmin>
              }
            />
            <Route
              path="admin/chat-manage"
              element={
                <RequireAdmin>
                  <AdminChatManagePage />
                </RequireAdmin>
              }
            />
            <Route
              path="app/chat/:id"
              element={
                <RequireAuth>
                  <AppChatPage />
                </RequireAuth>
              }
            />
            <Route
              path="app/edit/:id"
              element={
                <RequireAuth>
                  <AppEditPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="/user/login" element={<UserLoginPage />} />
          <Route path="/user/register" element={<UserRegisterPage />} />
        </Routes>
      </PageTransition>
    </Suspense>
  );
}

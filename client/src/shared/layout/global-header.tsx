import { Download, Info, Pencil, Sprout } from "lucide-react";
import { useState, type ReactNode } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "cn";
import { downloadAppCode } from "@/shared/api";
import { selectIsAdmin, useUserStore } from "@/shared/auth";
import {
  useAppById,
  useDeleteApp,
  useDeleteAppByAdmin,
  useLogout,
} from "@/shared/query";
import {
  appChatRouteParamsSchema,
  type AppId,
  type AppVo,
} from "@/shared/schemas";
import { AppDetailModal, Button, LoadingButton, UserInfo } from "@/shared/ui";
import { NavLink } from "./nav-links";
import { useVisibleNavLinks } from "./use-visible-nav-links";

function resolveChatAppId(pathname: string): AppId | undefined {
  const match = matchPath("/app/chat/:id", pathname);
  if (match === null) return undefined;
  const parsed = appChatRouteParamsSchema.safeParse(match.params);
  return parsed.success ? parsed.data.id : undefined;
}

export function GlobalHeader(): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUserStore((state) => state.user);
  const clear = useUserStore((state) => state.clear);
  const isAdmin = useUserStore(selectIsAdmin);
  const items = useVisibleNavLinks();
  const logoutMutation = useLogout();
  const deleteApp = useDeleteApp();
  const deleteAppByAdmin = useDeleteAppByAdmin();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // The chat page hands its app chrome to the header so the chat and preview
  // panes can use the full remaining viewport.
  const appId = resolveChatAppId(location.pathname);
  const appQuery = useAppById(appId);
  const app = appId === undefined ? undefined : appQuery.data;
  const isChatRoute = appId !== undefined;
  const canManage = app !== undefined && (isAdmin || app.userId === user?.id);

  const handleLogout = (): void => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        clear();
        toast.success("Logged out");
        navigate("/user/login", { replace: true });
      },
      onError: () => {
        toast.error("Logout failed");
      },
    });
  };

  const handleDownload = (): void => {
    if (app === undefined) return;
    setDownloading(true);
    void downloadAppCode(app.id)
      .catch(() => toast.error("Download failed"))
      .finally(() => setDownloading(false));
  };

  const handleDelete = (): void => {
    if (app === undefined) return;
    const mutation = isAdmin ? deleteAppByAdmin : deleteApp;
    mutation.mutate(
      { id: app.id },
      {
        onSuccess: () => {
          toast.success("App deleted");
          setDetailsOpen(false);
          navigate("/", { replace: true });
        },
        onError: () => toast.error("Delete failed"),
      },
    );
  };

  return (
    <header className="border-border/70 bg-background/80 supports-backdrop-filter:bg-background/70 sticky top-0 z-30 shrink-0 border-b backdrop-blur-xl">
      <div
        className={cn(
          "mx-auto flex h-13 w-full items-center justify-between gap-3 px-3 md:gap-4 md:px-4",
          isChatRoute ? "max-w-none" : "max-w-6xl md:px-6",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="Yukino Codegen home"
          >
            <span className="from-primary to-primary/70 shadow-primary/25 grid size-8 shrink-0 place-items-center rounded-lg bg-linear-to-br shadow-md transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-6">
              <Sprout className="size-4.5 text-white" aria-hidden="true" />
            </span>
            <span
              className={cn(
                "text-foreground text-[15px] font-bold tracking-tight",
                // On the chat page the app identity is the focus, so the
                // wordmark collapses to keep the header compact.
                isChatRoute ? "hidden 2xl:inline" : "hidden sm:inline",
              )}
            >
              Yukino <span className="text-primary font-semibold">Codegen</span>
            </span>
          </button>
          {app === undefined ? null : (
            <>
              <span
                className="bg-border/80 hidden h-6 w-px shrink-0 sm:block"
                aria-hidden="true"
              />
              <HeaderAppIdentity app={app} />
            </>
          )}
        </div>
        <nav
          className={cn(
            "hidden min-w-0 items-center gap-0.5",
            isChatRoute ? "xl:flex" : "md:flex",
          )}
        >
          {items.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              active={location.pathname === item.href}
              onNavigate={(href) => navigate(href)}
            />
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          {app === undefined ? null : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDetailsOpen(true)}
              >
                <Info className="size-4" aria-hidden="true" />
                <span className="hidden lg:inline">Details</span>
              </Button>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => navigate(`/app/edit/${app.id}`)}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  <span className="hidden lg:inline">Edit</span>
                </Button>
              ) : null}
              <LoadingButton
                size="sm"
                isLoading={downloading}
                onClick={handleDownload}
              >
                <Download className="size-4" aria-hidden="true" />
                <span className="hidden lg:inline">Download</span>
              </LoadingButton>
              <span
                className="bg-border/80 mx-0.5 hidden h-6 w-px sm:block"
                aria-hidden="true"
              />
            </>
          )}
          {user ? (
            <>
              <span className="hidden sm:inline">
                <UserInfo user={user} showName size="sm" />
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? "Logging out..." : "Logout"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => navigate("/user/login")}>
              Login
            </Button>
          )}
        </div>
      </div>
      {app === undefined ? null : (
        <AppDetailModal
          open={detailsOpen}
          app={app}
          showActions={canManage}
          onOpenChange={setDetailsOpen}
          onEdit={() => navigate(`/app/edit/${app.id}`)}
          onDelete={handleDelete}
        />
      )}
    </header>
  );
}

function HeaderAppIdentity({ app }: { readonly app: AppVo }): ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {app.appCover ? (
        <img
          src={app.appCover}
          alt=""
          className="border-border/70 size-8 shrink-0 rounded-lg border object-cover"
        />
      ) : (
        <span
          className="from-primary to-primary/70 shadow-primary/20 grid size-8 shrink-0 place-items-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white shadow-sm"
          aria-hidden="true"
        >
          {app.appName.trim().charAt(0).toUpperCase() || "A"}
        </span>
      )}
      <div className="max-w-[16rem] min-w-0">
        <p className="text-foreground truncate text-[13px] leading-tight font-semibold">
          {app.appName}
        </p>
        <p className="text-muted-foreground truncate text-[11px] leading-tight">
          {app.user?.userAccount ?? "Unknown User"}
        </p>
      </div>
    </div>
  );
}

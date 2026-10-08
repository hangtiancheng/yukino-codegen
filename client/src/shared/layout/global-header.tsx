import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sprout } from "lucide-react";
import { useUserStore } from "@/shared/auth";
import { useLogout } from "@/shared/query";
import { Button, UserInfo } from "@/shared/ui";
import { NavLink } from "./nav-links";
import { useVisibleNavLinks } from "./use-visible-nav-links";

export function GlobalHeader(): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUserStore((state) => state.user);
  const clear = useUserStore((state) => state.clear);
  const items = useVisibleNavLinks();
  const logoutMutation = useLogout();

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

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-30 border-b backdrop-blur-xl supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex h-13 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="group flex items-center gap-2.5"
          aria-label="Yukino Codegen home"
        >
          <span className="from-primary to-primary/70 shadow-primary/25 grid size-8 shrink-0 place-items-center rounded-lg bg-linear-to-br shadow-md transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
            <Sprout className="size-4.5 text-white" aria-hidden="true" />
          </span>
          <span className="text-foreground text-[15px] font-bold tracking-tight">
            Yukino{" "}
            <span className="text-primary font-semibold">Codegen</span>
          </span>
        </button>
        <nav className="hidden items-center gap-0.5 md:flex">
          {items.map((item) => (
            <NavLink
              key={item.key}
              item={item}
              active={location.pathname === item.href}
              onNavigate={(href) => navigate(href)}
            />
          ))}
        </nav>
        <div className="flex items-center gap-2">
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
    </header>
  );
}

import { type ReactNode } from "react";
import { cn } from "cn";
import type { NavLinkItem } from "./nav-links.config";

export type NavLinkProps = {
  readonly active: boolean;
  readonly item: NavLinkItem;
  readonly onNavigate: (href: string) => void;
};

export function NavLink({ active, item, onNavigate }: NavLinkProps): ReactNode {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(item.href)}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.label}
    </button>
  );
}

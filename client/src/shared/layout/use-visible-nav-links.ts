import { selectIsAdmin, useUserStore } from "@/shared/auth";
import { navLinks, type NavLinkItem } from "./nav-links.config";

export function useVisibleNavLinks(): ReadonlyArray<NavLinkItem> {
  const isAdmin = useUserStore(selectIsAdmin);
  return navLinks.filter((item) => !item.adminOnly || isAdmin);
}

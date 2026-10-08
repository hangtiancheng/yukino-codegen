export type NavLinkItem = {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly adminOnly?: boolean;
};

export const navLinks: ReadonlyArray<NavLinkItem> = [
  { key: "home", label: "Home", href: "/" },
  {
    key: "user-manage",
    label: "User Management",
    href: "/admin/user-manage",
    adminOnly: true,
  },
  {
    key: "app-manage",
    label: "App Management",
    href: "/admin/app-manage",
    adminOnly: true,
  },
  {
    key: "chat-manage",
    label: "Chat Management",
    href: "/admin/chat-manage",
    adminOnly: true,
  },
];

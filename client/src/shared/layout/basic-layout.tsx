import { type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { GlobalFooter } from "./global-footer";
import { GlobalHeader } from "./global-header";

export function BasicLayout(): ReactNode {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <GlobalHeader />
      <main className="m-0 w-full flex-1">
        <Outlet />
      </main>
      <GlobalFooter />
    </div>
  );
}

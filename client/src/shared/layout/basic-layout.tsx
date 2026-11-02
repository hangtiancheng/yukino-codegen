import { type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { GlobalHeader } from "./global-header";

export function BasicLayout(): ReactNode {
  return (
    <div className="bg-background text-foreground flex h-dvh flex-col overflow-hidden">
      <GlobalHeader />
      <main className="m-0 min-h-0 w-full flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

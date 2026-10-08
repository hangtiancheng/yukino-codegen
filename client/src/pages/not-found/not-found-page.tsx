import { Home, Sprout } from "lucide-react";
import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/ui";

export function NotFoundPage(): ReactNode {
  const navigate = useNavigate();
  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center">
      <div
        className="bg-grid-sage pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_55%_45%_at_50%_35%,black,transparent)]"
        aria-hidden="true"
      />
      <span className="border-primary/20 bg-primary/8 text-primary shadow-primary/10 relative mb-5 inline-flex size-14 items-center justify-center rounded-2xl border shadow-md">
        <Sprout className="size-7" aria-hidden="true" />
      </span>
      <p className="text-primary relative text-xs font-bold tracking-[0.2em] uppercase">
        404
      </p>
      <h1 className="text-foreground relative mt-1.5 text-2xl font-bold tracking-tight">
        This page wandered off
      </h1>
      <p className="text-muted-foreground relative mt-2.5 max-w-md text-sm leading-relaxed">
        The page you are looking for does not exist or has been moved. Let us
        take you back to familiar ground.
      </p>
      <Button className="relative mt-7" onClick={() => navigate("/")}>
        <Home data-icon="inline-start" aria-hidden="true" />
        Back to home
      </Button>
    </div>
  );
}

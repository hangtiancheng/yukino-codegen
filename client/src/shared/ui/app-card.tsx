import { MessageSquare, Sprout } from "lucide-react";
import { type ReactNode } from "react";
import { type AppVo } from "@/shared/schemas";
import { Badge } from "./badge";
import { Button } from "./button";
import { UserInfo } from "./user-info";

export type AppCardProps = {
  readonly app: AppVo;
  readonly featured?: boolean;
  readonly onViewDetails?: (app: AppVo) => void;
  readonly onViewChat?: (app: AppVo) => void;
};

export function AppCard({
  app,
  featured = false,
  onViewDetails,
  onViewChat,
}: AppCardProps): ReactNode {
  return (
    <article className="group border-border/80 bg-card shadow-soft hover:border-primary/35 hover:shadow-glow overflow-hidden rounded-xl border transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5">
      <div className="from-primary/12 via-background to-secondary/70 relative flex h-36 items-center justify-center overflow-hidden bg-linear-to-br">
        <div
          className="bg-grid-sage absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
          aria-hidden="true"
        />
        {app.appCover ? (
          <img
            src={app.appCover}
            alt={app.appName}
            className="relative size-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="relative flex flex-col items-center gap-2">
            <span className="border-primary/20 bg-card/90 text-primary shadow-soft grid size-12 place-items-center rounded-xl border">
              <Sprout className="size-6" aria-hidden="true" />
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              Generated with Yukino Codegen
            </span>
          </div>
        )}
        {featured ? (
          <Badge className="absolute top-2.5 left-2.5 shadow-sm">
            Featured
          </Badge>
        ) : null}
        <div className="bg-foreground/40 absolute inset-0 flex items-center justify-center gap-2.5 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
          <Button
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/90"
            onClick={() => onViewDetails?.(app)}
          >
            Details
          </Button>
          <Button size="sm" onClick={() => onViewChat?.(app)}>
            <MessageSquare data-icon="inline-start" />
            Open Chat
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <UserInfo user={app.user} showName={false} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="text-foreground truncate text-sm leading-tight font-semibold">
            {app.appName}
          </h3>
          <p className="text-muted-foreground truncate text-xs">
            {app.user?.userAccount ?? (featured ? "Official" : "Unknown User")}
          </p>
        </div>
      </div>
    </article>
  );
}

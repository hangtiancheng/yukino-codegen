import { type ReactNode } from "react";
import { type AppVo } from "@/shared/schemas";
import { AppCard, Badge, EmptyState, LoadingState } from "@/shared/ui";

export type AppSectionProps = {
  readonly title: string;
  readonly description: string;
  readonly apps: ReadonlyArray<AppVo>;
  readonly loading: boolean;
  readonly featured?: boolean;
  readonly onViewDetails: (app: AppVo) => void;
  readonly onViewChat: (app: AppVo) => void;
};

export function AppSection({
  title,
  description,
  apps,
  loading,
  featured = false,
  onViewDetails,
  onViewChat,
}: AppSectionProps): ReactNode {
  return (
    <section className="grid gap-4">
      <header className="border-border/70 flex items-end justify-between gap-4 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="bg-primary/70 h-4.5 w-1 rounded-full"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-foreground flex items-center gap-2 text-lg font-bold tracking-tight">
              {title}
              {!loading && apps.length > 0 ? (
                <Badge variant="secondary" className="font-semibold tabular-nums">
                  {apps.length}
                </Badge>
              ) : null}
            </h2>
            <p className="text-muted-foreground mt-0.5 pl-3.5 text-[13px]">
              {description}
            </p>
          </div>
        </div>
      </header>
      {loading ? (
        <LoadingState label={`Loading ${title.toLowerCase()}`} />
      ) : null}
      {!loading && apps.length === 0 ? (
        <EmptyState
          title="No apps found"
          description="New generated apps will appear here once available."
        />
      ) : null}
      {!loading && apps.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              featured={featured}
              onViewDetails={onViewDetails}
              onViewChat={onViewChat}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

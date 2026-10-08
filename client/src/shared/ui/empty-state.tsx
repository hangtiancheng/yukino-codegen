import { type ReactNode } from "react";
import { Sprout } from "lucide-react";
import { cn } from "cn";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty";

export type EmptyStateProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactNode {
  return (
    <Empty
      className={cn(
        "border-primary/25 bg-primary/[0.03] border py-8",
        className,
      )}
    >
      <EmptyHeader className="gap-1.5">
        <EmptyMedia
          variant="icon"
          className="border-primary/15 bg-background text-primary size-9 rounded-xl border [&_svg]:size-4.5"
        >
          <Sprout />
        </EmptyMedia>
        <EmptyTitle className="text-foreground text-[15px] font-semibold tracking-tight">
          {title}
        </EmptyTitle>
        {description ? (
          <EmptyDescription className="text-[13px]">
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

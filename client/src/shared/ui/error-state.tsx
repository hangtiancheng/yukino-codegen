import { type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty";

export type ErrorStateProps = {
  readonly title?: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function ErrorState({
  title = "Unable to load content",
  description,
  action,
  className,
}: ErrorStateProps): ReactNode {
  return (
    <Empty
      role="alert"
      className={cn(
        "border-destructive/25 bg-destructive/[0.04] border",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="border-destructive/15 bg-background text-destructive size-10 rounded-full border [&_svg]:size-5"
        >
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle className="text-foreground text-base font-semibold">
          {title}
        </EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

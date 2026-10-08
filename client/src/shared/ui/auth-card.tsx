import { Sprout } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "cn";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export type AuthCardProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
};

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps): ReactNode {
  return (
    <Card className={cn("fade-rise shadow-card w-full max-w-sm", className)}>
      <CardHeader className="items-center justify-items-center gap-1.5 text-center">
        <span
          className="from-primary to-primary/70 shadow-primary/25 mb-1 grid size-11 place-items-center rounded-xl bg-linear-to-br shadow-md"
          aria-hidden="true"
        >
          <Sprout className="size-5.5 text-white" />
        </span>
        <CardTitle className="text-lg font-bold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-[13px]">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? (
        <CardFooter className="text-muted-foreground justify-center text-[13px]">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

import { type ReactNode } from "react";

export type PageContainerProps = {
  readonly children: ReactNode;
  readonly title?: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
};

export function PageContainer({
  children,
  title,
  description,
  actions,
}: PageContainerProps): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      {title ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground flex items-center gap-2.5 text-xl font-semibold tracking-tight">
              <span
                className="bg-primary/80 h-5 w-1 rounded-full"
                aria-hidden="true"
              />
              {title}
            </h1>
            {description ? (
              <p className="text-muted-foreground pl-3.5 text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <main className="flex w-full flex-col gap-4">{children}</main>
    </div>
  );
}

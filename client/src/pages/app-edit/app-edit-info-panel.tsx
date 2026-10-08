import { type ReactNode } from "react";
import { formatDateTime } from "@/shared/lib";
import { type AppVo } from "@/shared/schemas";
import { UserInfo } from "@/shared/ui";

export type AppEditInfoPanelProps = {
  readonly app: AppVo;
};

export function AppEditInfoPanel({ app }: AppEditInfoPanelProps): ReactNode {
  return (
    <section className="border-border/80 bg-card shadow-soft grid gap-3.5 rounded-xl border p-4">
      <header>
        <h2 className="text-base font-semibold">App Info</h2>
        <p className="text-muted-foreground mt-0.5 text-[13px]">
          Metadata is validated from the app detail API response.
        </p>
      </header>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
        <InfoTile label="App ID" value={String(app.id)} />
        <InfoTile label="Creator">
          <UserInfo user={app.user} size="sm" />
        </InfoTile>
        <InfoTile label="Created" value={formatDateTime(app.createTime)} />
        <InfoTile label="Updated" value={formatDateTime(app.updateTime)} />
      </div>
    </section>
  );
}

function InfoTile({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value?: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className="border-border/70 bg-background/70 rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className="text-foreground mt-0.5 min-h-5 text-[13px] font-medium">
        {children ?? value}
      </div>
    </div>
  );
}

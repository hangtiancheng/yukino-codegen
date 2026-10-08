import { type ReactNode } from "react";
import {
  Button,
  DataTable,
  type DataTableColumn,
  LoadingButton,
} from "@/shared/ui";
import { type AppId, type AppVo } from "@/shared/schemas";
import { formatTimestamp } from "../admin-shared/format-admin-value";

export type AdminAppTableProps = {
  readonly apps: ReadonlyArray<AppVo>;
  readonly busyAppId: AppId | undefined;
  readonly onEdit: (app: AppVo) => void;
  readonly onToggleAwesome: (app: AppVo) => void;
  readonly onDelete: (app: AppVo) => void;
};

export function AdminAppTable({
  apps,
  busyAppId,
  onEdit,
  onToggleAwesome,
  onDelete,
}: AdminAppTableProps): ReactNode {
  return (
    <DataTable
      records={apps}
      columns={appColumns(busyAppId, onEdit, onToggleAwesome, onDelete)}
      getRowKey={(app) => app.id}
    />
  );
}

function appColumns(
  busyAppId: AppId | undefined,
  onEdit: (app: AppVo) => void,
  onToggleAwesome: (app: AppVo) => void,
  onDelete: (app: AppVo) => void,
): ReadonlyArray<DataTableColumn<AppVo>> {
  return [
    { key: "id", header: "ID", render: (app) => app.id },
    {
      key: "name", // appName
      header: "App",
      render: (app) => (
        <div>
          <p className="text-foreground font-medium">{app.appName}</p>
          <p className="text-muted-foreground max-w-64 truncate text-xs">
            {app.initPrompt}
          </p>
        </div>
      ),
    },
    {
      key: "cover", // appCover
      header: "Cover",
      render: (app) =>
        app.appCover ? (
          <img
            src={app.appCover}
            alt={app.appName}
            className="h-14 w-20 rounded object-cover"
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-14 w-20 items-center justify-center rounded text-xs">
            No Cover
          </div>
        ),
    },
    { key: "priority", header: "Priority", render: (app) => app.priority ?? 0 },
    {
      key: "creator",
      header: "Creator",
      render: (app) => app.user?.username ?? app.userId,
    },
    {
      key: "created",
      header: "Created",
      render: (app) => formatTimestamp(app.createTime),
    },
    {
      key: "actions",
      header: "Actions",
      render: (app) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(app)}>
            Edit
          </Button>
          <LoadingButton
            size="sm"
            variant="secondary"
            isLoading={busyAppId === app.id}
            onClick={() => onToggleAwesome(app)}
          >
            {app.priority === 99 ? "Unfeature" : "Feature"}
          </LoadingButton>
          <LoadingButton
            size="sm"
            variant="destructive"
            isLoading={busyAppId === app.id}
            onClick={() => onDelete(app)}
          >
            Delete
          </LoadingButton>
        </div>
      ),
    },
  ];
}

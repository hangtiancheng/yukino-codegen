import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  useAdminAppPage,
  useDeleteAppByAdmin,
  useUpdateAppByAdmin,
} from "@/shared/query";
import { type AppId, type AppVo } from "@/shared/schemas";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PaginationControls,
} from "@/shared/ui";
import { AdminAppFilters } from "./admin-app-filters";
import {
  buildAdminAppQuery,
  initialAdminAppFilters,
  type AdminAppFilterValues,
} from "./admin-app-query";
import { AdminAppTable } from "./admin-app-table";

export function AdminAppManagePage(): ReactNode {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AdminAppFilterValues>(
    initialAdminAppFilters,
  );
  const [submittedFilters, setSubmittedFilters] =
    useState<AdminAppFilterValues>(initialAdminAppFilters);
  const [pageNum, setPageNum] = useState(1);
  const [busyAppId, setBusyAppId] = useState<AppId | undefined>();
  const queryParams = useMemo(
    () => buildAdminAppQuery(submittedFilters, pageNum),
    [submittedFilters, pageNum],
  );
  const appsQuery = useAdminAppPage(queryParams);
  const updateApp = useUpdateAppByAdmin();
  const deleteApp = useDeleteAppByAdmin();
  const page = appsQuery.data;

  const handleToggleAwesome = (app: AppVo): void => {
    setBusyAppId(app.id);
    updateApp.mutate(
      { id: app.id, priority: app.priority === 99 ? 0 : 99 },
      {
        onSuccess: () => toast.success("Priority updated"),
        onError: () => toast.error("Update failed"),
        onSettled: () => setBusyAppId(undefined),
      },
    );
  };

  const handleDelete = (app: AppVo): void => {
    setBusyAppId(app.id);
    deleteApp.mutate(
      { id: app.id },
      {
        onSuccess: () => toast.success("App deleted"),
        onError: () => toast.error("Delete failed"),
        onSettled: () => setBusyAppId(undefined),
      },
    );
  };

  return (
    <PageContainer
      title="App Management"
      description="Audit generated apps, curate featured cases, and manage records."
    >
      <AdminAppFilters
        values={filters}
        onChange={setFilters}
        onSubmit={() => {
          setSubmittedFilters(filters);
          setPageNum(1);
        }}
        onReset={() => {
          setFilters(initialAdminAppFilters);
          setSubmittedFilters(initialAdminAppFilters);
          setPageNum(1);
        }}
      />
      {renderAppContent(appsQuery.isLoading, appsQuery.isError, page, {
        busyAppId,
        onEdit: (app) => navigate(`/app/edit/${app.id}`),
        onToggleAwesome: handleToggleAwesome,
        onDelete: handleDelete,
        onRetry: () => void appsQuery.refetch(),
        onPageChange: setPageNum,
      })}
    </PageContainer>
  );
}

type RenderAppContentOptions = {
  readonly busyAppId: AppId | undefined;
  readonly onEdit: (app: AppVo) => void;
  readonly onToggleAwesome: (app: AppVo) => void;
  readonly onDelete: (app: AppVo) => void;
  readonly onRetry: () => void;
  readonly onPageChange: (pageNumber: number) => void;
};

function renderAppContent(
  loading: boolean,
  error: boolean,
  page: ReturnType<typeof useAdminAppPage>["data"],
  options: RenderAppContentOptions,
): ReactNode {
  if (loading) return <LoadingState label="Loading apps" />;
  if (error) {
    return (
      <ErrorState
        description="Please retry or adjust the current filters."
        action={<Button onClick={options.onRetry}>Retry</Button>}
      />
    );
  }
  if (!page || page.records.length === 0) {
    return <EmptyState title="No apps found" />;
  }
  return (
    <>
      <AdminAppTable apps={page.records} {...options} />
      <PaginationControls
        pageNumber={page.pageNumber}
        pageSize={page.pageSize}
        totalPage={page.totalPage}
        totalRow={page.totalRow}
        onPageChange={options.onPageChange}
      />
    </>
  );
}

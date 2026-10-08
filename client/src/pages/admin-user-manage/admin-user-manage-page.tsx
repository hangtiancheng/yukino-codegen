import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDeleteUser, useUserPage } from "@/shared/query";
import { type UserId, type UserVo } from "@/shared/schemas";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PaginationControls,
} from "@/shared/ui";
import { AdminUserFilters } from "./admin-user-filters";
import {
  buildAdminUserQuery,
  initialAdminUserFilters,
  type AdminUserFilterValues,
} from "./admin-user-query";
import { AdminUserTable } from "./admin-user-table";

export function AdminUserManagePage(): ReactNode {
  const [filters, setFilters] = useState<AdminUserFilterValues>(
    initialAdminUserFilters,
  );
  const [submittedFilters, setSubmittedFilters] =
    useState<AdminUserFilterValues>(initialAdminUserFilters);
  const [pageNum, setPageNum] = useState(1);
  const [deletingId, setDeletingId] = useState<UserId | undefined>();
  const queryParams = useMemo(
    () => buildAdminUserQuery(submittedFilters, pageNum),
    [submittedFilters, pageNum],
  );
  const usersQuery = useUserPage(queryParams);
  const deleteUser = useDeleteUser();
  const page = usersQuery.data;

  const handleDelete = (user: UserVo): void => {
    setDeletingId(user.id);
    deleteUser.mutate(
      { id: user.id },
      {
        onSuccess: () => toast.success("User deleted"),
        onError: () => toast.error("Delete failed"),
        onSettled: () => setDeletingId(undefined),
      },
    );
  };

  return (
    <PageContainer
      title="User Management"
      description="Search users, inspect roles, and remove invalid accounts."
    >
      <AdminUserFilters
        values={filters}
        onChange={setFilters}
        onSubmit={() => {
          setSubmittedFilters(filters);
          setPageNum(1);
        }}
        onReset={() => {
          setFilters(initialAdminUserFilters);
          setSubmittedFilters(initialAdminUserFilters);
          setPageNum(1);
        }}
      />
      {renderUserContent(usersQuery.isLoading, usersQuery.isError, page, {
        deletingId,
        onDelete: handleDelete,
        onRetry: () => void usersQuery.refetch(),
        onPageChange: setPageNum,
      })}
    </PageContainer>
  );
}

type RenderUserContentOptions = {
  readonly deletingId: UserId | undefined;
  readonly onDelete: (user: UserVo) => void;
  readonly onRetry: () => void;
  readonly onPageChange: (pageNumber: number) => void;
};

function renderUserContent(
  loading: boolean,
  error: boolean,
  page: ReturnType<typeof useUserPage>["data"],
  options: RenderUserContentOptions,
): ReactNode {
  if (loading) return <LoadingState label="Loading users" />;
  if (error) {
    return (
      <ErrorState
        description="Please retry or adjust the current filters."
        action={<Button onClick={options.onRetry}>Retry</Button>}
      />
    );
  }
  if (!page || page.records.length === 0) {
    return <EmptyState title="No users found" />;
  }
  return (
    <>
      <AdminUserTable
        users={page.records}
        deletingId={options.deletingId}
        onDelete={options.onDelete}
      />
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

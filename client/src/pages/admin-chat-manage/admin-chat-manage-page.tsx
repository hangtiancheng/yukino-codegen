import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminChatHistoryPage } from "@/shared/query";
import { type ChatHistory } from "@/shared/schemas";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PaginationControls,
} from "@/shared/ui";
import { AdminChatFilters } from "./admin-chat-filters";
import {
  buildAdminChatQuery,
  initialAdminChatFilters,
  type AdminChatFilterValues,
} from "./admin-chat-query";
import { AdminChatTable } from "./admin-chat-table";

export function AdminChatManagePage(): ReactNode {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AdminChatFilterValues>(
    initialAdminChatFilters,
  );
  const [submittedFilters, setSubmittedFilters] =
    useState<AdminChatFilterValues>(initialAdminChatFilters);
  const [pageNum, setPageNum] = useState(1);
  const queryParams = useMemo(
    () => buildAdminChatQuery(submittedFilters, pageNum),
    [submittedFilters, pageNum],
  );
  const chatQuery = useAdminChatHistoryPage(queryParams);
  const page = chatQuery.data;

  return (
    <PageContainer
      title="Chat Management"
      description="Inspect generation messages and jump into related chats."
    >
      <AdminChatFilters
        values={filters}
        onChange={setFilters}
        onSubmit={() => {
          setSubmittedFilters(filters);
          setPageNum(1);
        }}
        onReset={() => {
          setFilters(initialAdminChatFilters);
          setSubmittedFilters(initialAdminChatFilters);
          setPageNum(1);
        }}
      />
      {renderChatContent(chatQuery.isLoading, chatQuery.isError, page, {
        onViewChat: (message) => navigate(`/app/chat/${message.appId}?view=1`),
        onRetry: () => void chatQuery.refetch(),
        onPageChange: setPageNum,
      })}
    </PageContainer>
  );
}

type RenderChatContentOptions = {
  readonly onViewChat: (message: ChatHistory) => void;
  readonly onRetry: () => void;
  readonly onPageChange: (pageNumber: number) => void;
};

function renderChatContent(
  loading: boolean,
  error: boolean,
  page: ReturnType<typeof useAdminChatHistoryPage>["data"],
  options: RenderChatContentOptions,
): ReactNode {
  if (loading) return <LoadingState label="Loading chat messages" />;
  if (error) {
    return (
      <ErrorState
        description="Please retry or adjust the current filters."
        action={<Button onClick={options.onRetry}>Retry</Button>}
      />
    );
  }
  if (!page || page.records.length === 0) {
    return <EmptyState title="No chat messages found" />;
  }
  return (
    <>
      <AdminChatTable messages={page.records} onViewChat={options.onViewChat} />
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

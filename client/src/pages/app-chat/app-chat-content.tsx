import { type ReactNode } from "react";
import { isApiExceptionWithStatus } from "@/shared/api";
import { useAppById } from "@/shared/query";
import { type AppId } from "@/shared/schemas";
import {
  EmptyState,
  ErrorState,
  LoadingButton,
  LoadingState,
} from "@/shared/ui";
import { AppChatWorkspace } from "./app-chat-workspace";

export function AppChatContent({
  appId,
}: {
  readonly appId: AppId;
}): ReactNode {
  const appQuery = useAppById(appId);
  const app = appQuery.data;
  if (appQuery.isLoading) {
    return <LoadingState label="Loading chat workspace" />;
  }
  if (appQuery.isError) {
    if (isApiExceptionWithStatus(appQuery.error, 404)) {
      return <EmptyState title="App not found" />;
    }
    return (
      <ErrorState
        title="Unable to load app"
        description="The chat workspace could not be loaded."
        action={
          <LoadingButton
            variant="outline"
            isLoading={appQuery.isFetching}
            onClick={() => void appQuery.refetch()}
          >
            Retry
          </LoadingButton>
        }
      />
    );
  }
  if (app === undefined) {
    return (
      <ErrorState
        title="App data unavailable"
        description="The request succeeded without returning app details."
        action={
          <LoadingButton
            variant="outline"
            isLoading={appQuery.isFetching}
            onClick={() => void appQuery.refetch()}
          >
            Retry
          </LoadingButton>
        }
      />
    );
  }
  return <AppChatWorkspace key={app.id} app={app} />;
}

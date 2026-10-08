import { useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { selectIsAdmin, useUserStore } from "@/shared/auth";
import { downloadAppCode, isApiExceptionWithStatus } from "@/shared/api";
import { useAppById, useUpdateApp, useUpdateAppByAdmin } from "@/shared/query";
import { type AppId } from "@/shared/schemas";
import {
  EmptyState,
  ErrorState,
  LoadingButton,
  LoadingState,
  PageContainer,
} from "@/shared/ui";
import { AppEditForm } from "./app-edit-form";
import { optionalCover } from "./app-edit-form-schema";
import { AppEditInfoPanel } from "./app-edit-info-panel";
import { AppEditToolbar } from "./app-edit-toolbar";

export type AppEditContentProps = {
  readonly appId: AppId;
};

export function AppEditContent({ appId }: AppEditContentProps): ReactNode {
  const navigate = useNavigate();
  const [formKey, setFormKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const user = useUserStore((state) => state.user);
  const isAdmin = useUserStore(selectIsAdmin);
  const appQuery = useAppById(appId);
  const updateApp = useUpdateApp();
  const updateAppByAdmin = useUpdateAppByAdmin();
  const app = appQuery.data;

  if (appQuery.isLoading) return <LoadingState label="Loading app details" />;
  if (appQuery.isError) {
    if (isApiExceptionWithStatus(appQuery.error, 404)) {
      return <EmptyState title="App not found" />;
    }
    return (
      <ErrorState
        title="Unable to load app"
        description="The app details could not be loaded."
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
  if (!isAdmin && app.userId !== user?.id) return navigateHome();

  return (
    <PageContainer
      title="Edit App"
      description="Update metadata and download generated source code."
    >
      <AppEditToolbar
        downloading={downloading}
        onDownload={() => {
          setDownloading(true);
          void downloadAppCode(app.id)
            .catch(() => toast.error("Download failed"))
            .finally(() => setDownloading(false));
        }}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <AppEditForm
          key={formKey}
          app={app}
          admin={isAdmin}
          submitting={updateApp.isPending || updateAppByAdmin.isPending}
          onReset={() => setFormKey((value) => value + 1)}
          onOpenChat={() => navigate(`/app/chat/${app.id}`)}
          onSubmit={(values) => {
            if (isAdmin) {
              updateAppByAdmin.mutate(
                {
                  id: app.id,
                  appName: values.appName,
                  appCover: optionalCover(values.appCover),
                  priority: values.priority,
                },
                mutationToast,
              );
              return;
            }
            updateApp.mutate(
              { id: app.id, appName: values.appName },
              mutationToast,
            );
          }}
        />
        <AppEditInfoPanel app={app} />
      </div>
    </PageContainer>
  );
}

const mutationToast = {
  onSuccess: () => toast.success("Update successful"),
  onError: () => toast.error("Update failed"),
};

function navigateHome(): ReactNode {
  return <Navigate to="/" replace />;
}

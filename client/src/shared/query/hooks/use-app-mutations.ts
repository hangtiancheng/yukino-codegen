import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  addApp,
  deleteApp,
  deleteAppByAdmin,
  updateApp,
  updateAppByAdmin,
} from "@/shared/api";
import {
  type AppAddRequest,
  type AppAdminUpdateRequest,
  type AppDeleteRequest,
  type AppId,
  type AppUpdateRequest,
} from "@/shared/schemas";
import { queryKeys } from "../query-keys";

export function useAddApp(): UseMutationResult<AppId, Error, AppAddRequest> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: addApp,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.app.all });
    },
  });
}

export function useUpdateApp(): UseMutationResult<
  boolean,
  Error,
  AppUpdateRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateApp,
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: queryKeys.app.byId(variables.id),
      });
      void client.invalidateQueries({ queryKey: queryKeys.app.all });
    },
  });
}

export function useUpdateAppByAdmin(): UseMutationResult<
  boolean,
  Error,
  AppAdminUpdateRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateAppByAdmin,
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: queryKeys.app.byId(variables.id),
      });
      void client.invalidateQueries({ queryKey: queryKeys.app.all });
    },
  });
}

export function useDeleteApp(): UseMutationResult<
  boolean,
  Error,
  AppDeleteRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteApp,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.app.all });
    },
  });
}

export function useDeleteAppByAdmin(): UseMutationResult<
  boolean,
  Error,
  AppDeleteRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteAppByAdmin,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.app.all });
    },
  });
}

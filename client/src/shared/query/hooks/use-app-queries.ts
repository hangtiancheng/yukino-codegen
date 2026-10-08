import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getAppById,
  listAdminAppPage,
  listAwesomeAppPage,
  listMyAppPage,
  type AppPage,
} from "@/shared/api";
import { type AppId, type AppQueryRequest, type AppVo } from "@/shared/schemas";
import { queryKeys } from "../query-keys";

export function useAppById(appId: AppId | undefined): UseQueryResult<AppVo> {
  return useQuery({
    queryKey: appId ? queryKeys.app.byId(appId) : ["app", "byId", "disabled"],
    queryFn: () => {
      if (!appId) {
        throw new Error("appId is required");
      }
      return getAppById(appId);
    },
    enabled: appId !== undefined,
  });
}

export function useMyAppPage(
  params: AppQueryRequest,
  enabled = true,
): UseQueryResult<AppPage> {
  return useQuery({
    queryKey: queryKeys.app.myList(params),
    queryFn: () => listMyAppPage(params),
    enabled,
  });
}

export function useAwesomeAppPage(
  params: AppQueryRequest,
  enabled = true,
): UseQueryResult<AppPage> {
  return useQuery({
    queryKey: queryKeys.app.awesomeList(params),
    queryFn: () => listAwesomeAppPage(params),
    enabled,
  });
}

export function useAdminAppPage(
  params: AppQueryRequest,
  enabled = true,
): UseQueryResult<AppPage> {
  return useQuery({
    queryKey: queryKeys.app.adminList(params),
    queryFn: () => listAdminAppPage(params),
    enabled,
  });
}

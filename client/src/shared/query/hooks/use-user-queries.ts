import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  ApiException,
  getCurrentUser,
  listUserPage,
  type UserPage,
} from "@/shared/api";
import { type LoginUserVo, type UserQueryRequest } from "@/shared/schemas";
import { queryKeys } from "../query-keys";

export function useCurrentUser(): UseQueryResult<LoginUserVo | null> {
  return useQuery({
    queryKey: queryKeys.user.current,
    queryFn: async (): Promise<LoginUserVo | null> => {
      try {
        return await getCurrentUser();
      } catch (cause) {
        if (
          cause instanceof ApiException &&
          (cause.error.kind === "unauthorized" ||
            cause.error.kind === "business")
        ) {
          return null;
        }
        throw cause;
      }
    },
    retry: false,
  });
}

export function useUserPage(
  params: UserQueryRequest,
  enabled = true,
): UseQueryResult<UserPage> {
  return useQuery({
    queryKey: queryKeys.user.listPage(params),
    queryFn: () => listUserPage(params),
    enabled,
  });
}

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  deleteUser,
  login,
  logout,
  register,
  updateUserProfile,
} from "@/shared/api";
import {
  type LoginUserVo,
  type UserDeleteRequest,
  type UserLoginRequest,
  type UserRegisterRequest,
  type UserUpdateRequest,
} from "@/shared/schemas";
import { queryKeys } from "../query-keys";

export function useLogin(): UseMutationResult<
  LoginUserVo,
  Error,
  UserLoginRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      client.setQueryData(queryKeys.user.current, data);
      void client.invalidateQueries({ queryKey: queryKeys.user.all });
    },
  });
}

export function useRegister(): UseMutationResult<
  string,
  Error,
  UserRegisterRequest
> {
  return useMutation({ mutationFn: register });
}

export function useLogout(): UseMutationResult<boolean, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      client.setQueryData(queryKeys.user.current, null);
      void client.invalidateQueries({ queryKey: queryKeys.user.all });
    },
  });
}

export function useUpdateUserProfile(): UseMutationResult<
  boolean,
  Error,
  UserUpdateRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.user.all });
    },
  });
}

export function useDeleteUser(): UseMutationResult<
  boolean,
  Error,
  UserDeleteRequest
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.user.all });
    },
  });
}

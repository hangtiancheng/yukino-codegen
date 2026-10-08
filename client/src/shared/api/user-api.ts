import { z } from "zod";
import { httpClient } from "./http-client-singleton";
import {
  loginUserVoSchema,
  pageSchema,
  userDeleteRequestSchema,
  userLoginRequestSchema,
  userQueryRequestSchema,
  userRegisterRequestSchema,
  userUpdateRequestSchema,
  userVoSchema,
  type LoginUserVo,
  type UserDeleteRequest,
  type UserLoginRequest,
  type UserQueryRequest,
  type UserRegisterRequest,
  type UserUpdateRequest,
} from "@/shared/schemas";

const pageUserVoSchema = pageSchema(userVoSchema);

export type UserPage = z.infer<typeof pageUserVoSchema>;

export async function login(body: UserLoginRequest): Promise<LoginUserVo> {
  return httpClient.request(
    {
      method: "POST",
      url: "user/login",
      body: userLoginRequestSchema.parse(body),
    },
    loginUserVoSchema,
  );
}

export async function register(body: UserRegisterRequest): Promise<string> {
  return httpClient.request(
    {
      method: "POST",
      url: "user/register",
      body: userRegisterRequestSchema.parse(body),
    },
    z.string().min(1),
  );
}

export async function logout(): Promise<boolean> {
  return httpClient.request(
    { method: "POST", url: "user/logout" },
    z.boolean(),
  );
}

export async function getCurrentUser(): Promise<LoginUserVo> {
  return httpClient.request(
    { method: "GET", url: "user/get/login" },
    loginUserVoSchema,
  );
}

export async function updateUserProfile(
  body: UserUpdateRequest,
): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "user/update",
      body: userUpdateRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

export async function deleteUser(body: UserDeleteRequest): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "user/delete",
      body: userDeleteRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

export async function listUserPage(body: UserQueryRequest): Promise<UserPage> {
  return httpClient.request(
    {
      method: "POST",
      url: "user/list/page/vo",
      body: userQueryRequestSchema.parse(body),
    },
    pageUserVoSchema,
  );
}

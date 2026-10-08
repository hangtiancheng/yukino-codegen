import { z } from "zod";
import { getEndpointPaths } from "@/shared/config";
import { mapAppQueryRequest } from "./app-query-request";
import { httpClient } from "./http-client-singleton";
import {
  appAddRequestSchema,
  appAdminUpdateRequestSchema,
  appDeleteRequestSchema,
  appUpdateRequestSchema,
  appIdSchema,
  appVoSchema,
  pageSchema,
  type AppAddRequest,
  type AppAdminUpdateRequest,
  type AppDeleteRequest,
  type AppId,
  type AppQueryRequest,
  type AppUpdateRequest,
  type AppVo,
} from "@/shared/schemas";

const pageAppSchema = pageSchema(appVoSchema);

export type AppPage = z.infer<typeof pageAppSchema>;

export async function getAppById(id: AppId): Promise<AppVo> {
  return httpClient.request(
    { method: "GET", url: "app/get/vo", query: { id } },
    appVoSchema,
  );
}

export async function listMyAppPage(body: AppQueryRequest): Promise<AppPage> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/my/list/page/vo",
      body: mapAppQueryBody(body),
      suppressUnauthorizedRedirect: true,
    },
    pageAppSchema,
  );
}

export async function listAwesomeAppPage(
  body: AppQueryRequest,
): Promise<AppPage> {
  return httpClient.request(
    {
      method: "POST",
      url: getEndpointPaths().awesomeAppList,
      body: mapAppQueryBody(body),
    },
    pageAppSchema,
  );
}

export async function listAdminAppPage(
  body: AppQueryRequest,
): Promise<AppPage> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/admin/list/page/vo",
      body: mapAppQueryBody(body),
    },
    pageAppSchema,
  );
}

function mapAppQueryBody(body: AppQueryRequest): unknown {
  return mapAppQueryRequest(body);
}

export async function addApp(body: AppAddRequest): Promise<AppId> {
  return httpClient.request(
    { method: "POST", url: "app/add", body: appAddRequestSchema.parse(body) },
    appIdSchema,
  );
}

export async function updateApp(body: AppUpdateRequest): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/update",
      body: appUpdateRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

export async function updateAppByAdmin(
  body: AppAdminUpdateRequest,
): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/admin/update",
      body: appAdminUpdateRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

export async function deleteApp(body: AppDeleteRequest): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/delete",
      body: appDeleteRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

export async function deleteAppByAdmin(
  body: AppDeleteRequest,
): Promise<boolean> {
  return httpClient.request(
    {
      method: "POST",
      url: "app/admin/delete",
      body: appDeleteRequestSchema.parse(body),
    },
    z.boolean(),
  );
}

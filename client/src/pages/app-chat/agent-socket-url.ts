import { getApiBaseUrl } from "@/shared/config";
import { type AppId } from "@/shared/schemas";

export function buildAgentSocketUrl(appId: AppId): string {
  const url = new URL(getApiBaseUrl());
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Unsupported API URL protocol: ${url.protocol}`);
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/app/${encodeURIComponent(appId)}/agent/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

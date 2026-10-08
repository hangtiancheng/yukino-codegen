import { getApiBaseUrl } from "@/shared/config";
import { createHttpClient, type HttpClient } from "./http-client";

export const httpClient: HttpClient = createHttpClient(getApiBaseUrl);

import { type AppQueryRequest } from "@/shared/schemas";
import { appQueryRequestSchema } from "@/shared/schemas";

export function mapAppQueryRequest(body: AppQueryRequest): unknown {
  return appQueryRequestSchema.parse(body);
}

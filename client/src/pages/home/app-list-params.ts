import { appQueryRequestSchema } from "@/shared/schemas";

export const homeAppListParams = appQueryRequestSchema.parse({
  current: 1,
  pageSize: 6,
  sortField: "createTime",
  sortOrder: "descend",
});

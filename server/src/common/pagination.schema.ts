import { z } from "zod";

export const sortOrderSchema = z.enum(["ascend", "descend"]);

export const pageRequestSchema = z.object({
  current: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(20).default(10),
  sortField: z.string().min(1).max(64).optional(),
  sortOrder: sortOrderSchema.optional(),
});

export type PageRequest = z.infer<typeof pageRequestSchema>;

export type PageResponse<T> = Readonly<{
  records: T[];
  current: number;
  pageSize: number;
  total: number;
  totalPage: number;
}>;

export const createPageResponse = <T>(
  records: T[],
  request: Pick<PageRequest, "current" | "pageSize">,
  total: number,
): PageResponse<T> => ({
  records,
  current: request.current,
  pageSize: request.pageSize,
  total,
  totalPage: Math.ceil(total / request.pageSize),
});

export const toOffset = (request: PageRequest) => ({
  skip: (request.current - 1) * request.pageSize,
  take: request.pageSize,
});

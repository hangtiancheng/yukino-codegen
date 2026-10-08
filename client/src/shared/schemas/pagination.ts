import { z } from "zod";
import { nonNegativeIntSchema, positiveIntSchema } from "./primitives";

type Page<TRecord extends z.ZodTypeAny> = Readonly<{
  records: ReadonlyArray<z.infer<TRecord>>;
  pageNumber: number;
  pageSize: number;
  totalPage: number;
  totalRow: number;
}>;

export function pageSchema<TRecord extends z.ZodTypeAny>(
  record: TRecord,
): z.ZodType<Page<TRecord>> {
  return z
    .object({
      records: z.array(record),
      current: positiveIntSchema,
      pageSize: positiveIntSchema,
      total: nonNegativeIntSchema,
      totalPage: nonNegativeIntSchema,
    })
    .transform(({ records, current, pageSize, total, totalPage }) => ({
      records,
      pageNumber: current,
      pageSize,
      totalPage,
      totalRow: total,
    }));
}

export const paginationQuerySchema = z.object({
  current: positiveIntSchema.default(1),
  pageSize: positiveIntSchema.default(10),
  sortField: z.string().optional(),
  sortOrder: z.enum(["ascend", "descend"]).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

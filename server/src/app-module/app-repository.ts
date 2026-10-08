import type { PrismaDatabaseClient } from "../database/index.js";
import type { SortableAppField } from "./app-sorting.js";

type CreateAppInput = Readonly<{
  appName: string;
  initPrompt: string;
  userId: bigint;
}>;

type UpdateAppInput = Readonly<{
  appCover?: string;
  appName?: string;
  priority?: number;
}>;

export type AppListFilter = Readonly<{
  appName?: string;
  id?: bigint;
  initPrompt?: string;
  priority?: number;
  userId?: bigint;
}>;

export type ListAppParams = Readonly<{
  filter: AppListFilter;
  skip: number;
  sort: { field: SortableAppField; order: "asc" | "desc" };
  take: number;
}>;

const buildCreateData = (data: CreateAppInput) => ({
  appName: data.appName,
  initPrompt: data.initPrompt,
  userId: data.userId,
});

const buildUpdateData = (data: UpdateAppInput) => ({
  ...(data.appCover !== undefined && { appCover: data.appCover }),
  ...(data.appName !== undefined && { appName: data.appName }),
  ...(data.priority !== undefined && { priority: data.priority }),
});

const buildListWhere = (filter: AppListFilter) => ({
  isDelete: false,
  ...(filter.id !== undefined && { id: filter.id }),
  ...(filter.priority !== undefined && { priority: filter.priority }),
  ...(filter.userId !== undefined && { userId: filter.userId }),
  ...(filter.appName !== undefined && { appName: { contains: filter.appName } }),
  ...(filter.initPrompt !== undefined && {
    initPrompt: { contains: filter.initPrompt },
  }),
});

export const createAppRepository = (db: PrismaDatabaseClient) => ({
  countActive: (filter: AppListFilter) => db.app.count({ where: buildListWhere(filter) }),

  createApp: (data: CreateAppInput) => db.app.create({ data: buildCreateData(data) }),

  findActiveById: (id: bigint) => db.app.findFirst({ where: { id, isDelete: false } }),

  listActive: (params: ListAppParams) =>
    db.app.findMany({
      orderBy: { [params.sort.field]: params.sort.order },
      skip: params.skip,
      take: params.take,
      where: buildListWhere(params.filter),
    }),

  softDeleteById: (id: bigint) => db.app.update({ data: { isDelete: true }, where: { id } }),

  updateById: (id: bigint, data: UpdateAppInput) =>
    db.app.update({ data: buildUpdateData(data), where: { id } }),
});

export type AppRepository = ReturnType<typeof createAppRepository>;

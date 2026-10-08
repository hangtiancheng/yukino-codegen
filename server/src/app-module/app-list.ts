import { createPageResponse, type PageResponse } from "../common/index.js";
import { toAppVo } from "./app.mapper.js";
import type { AppPageQuery, AppVo } from "./app.schema.js";
import { buildAppListFilter } from "./app-filter.js";
import type { AppListFilter, AppRepository } from "./app-repository.js";
import { resolveAppSortField } from "./app-sorting.js";

export const createListAppVoByPageOperation =
  (appRepository: AppRepository) =>
  async (query: AppPageQuery, overrides: AppListFilter = {}): Promise<PageResponse<AppVo>> => {
    const filter: AppListFilter = {
      ...buildAppListFilter(query),
      ...overrides,
    };
    const [apps, total] = await Promise.all([
      appRepository.listActive({
        filter,
        skip: (query.current - 1) * query.pageSize,
        sort: {
          field: resolveAppSortField(query.sortField),
          order: query.sortOrder === "ascend" ? "asc" : "desc",
        },
        take: query.pageSize,
      }),
      appRepository.countActive(filter),
    ]);
    return createPageResponse(apps.map(toAppVo), query, total);
  };

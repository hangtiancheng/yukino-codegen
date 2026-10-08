import type { PrismaDatabaseClient } from "../database/index.js";
import type { UserRole } from "../generated/prisma/enums.js";
import type { SortableUserField } from "./user-sorting.js";

type CreateUserInput = Readonly<{
  userAccount: string;
  userAvatar?: string;
  username?: string;
  userPassword: string;
  userRole?: UserRole;
}>;

type UpdateUserInput = Readonly<{
  userAvatar?: string;
  username?: string;
  userPassword?: string;
  userProfile?: string;
  userRole?: UserRole;
}>;

type ListUserParams = Readonly<{
  filter: {
    id?: bigint;
    userAccount?: string;
    username?: string;
    userProfile?: string;
    userRole?: UserRole;
  };
  skip: number;
  sort: { field: SortableUserField; order: "asc" | "desc" };
  take: number;
}>;

const buildCreateData = (data: CreateUserInput) => ({
  userAccount: data.userAccount,
  userPassword: data.userPassword,
  ...(data.userAvatar !== undefined && { userAvatar: data.userAvatar }),
  ...(data.username !== undefined && { username: data.username }),
  ...(data.userRole !== undefined && { userRole: data.userRole }),
});

const buildUpdateData = (data: UpdateUserInput) => ({
  ...(data.userAvatar !== undefined && { userAvatar: data.userAvatar }),
  ...(data.username !== undefined && { username: data.username }),
  ...(data.userPassword !== undefined && { userPassword: data.userPassword }),
  ...(data.userProfile !== undefined && { userProfile: data.userProfile }),
  ...(data.userRole !== undefined && { userRole: data.userRole }),
});

const buildListWhere = (filter: ListUserParams["filter"]) => ({
  isDelete: false,
  ...(filter.id !== undefined && { id: filter.id }),
  ...(filter.userAccount !== undefined && {
    userAccount: { contains: filter.userAccount },
  }),
  ...(filter.username !== undefined && {
    username: { contains: filter.username },
  }),
  ...(filter.userProfile !== undefined && {
    userProfile: { contains: filter.userProfile },
  }),
  ...(filter.userRole !== undefined && { userRole: filter.userRole }),
});

export const createUserRepository = (db: PrismaDatabaseClient) => ({
  countActive: (filter: ListUserParams["filter"]) =>
    db.user.count({ where: buildListWhere(filter) }),

  createUser: (data: CreateUserInput) => db.user.create({ data: buildCreateData(data) }),

  findActiveByAccount: (userAccount: string) =>
    db.user.findFirst({
      where: { isDelete: false, userAccount },
    }),

  findActiveById: (id: bigint) =>
    db.user.findFirst({
      where: { id, isDelete: false },
    }),

  listActive: (params: ListUserParams) =>
    db.user.findMany({
      orderBy: { [params.sort.field]: params.sort.order },
      skip: params.skip,
      take: params.take,
      where: buildListWhere(params.filter),
    }),

  softDeleteById: (id: bigint) =>
    db.user.update({
      data: { isDelete: true },
      where: { id },
    }),

  updateById: (id: bigint, data: UpdateUserInput) =>
    db.user.update({
      data: buildUpdateData(data),
      where: { id },
    }),
});

export type UserRepository = ReturnType<typeof createUserRepository>;

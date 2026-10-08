import {
  createPageResponse,
  ErrorCode,
  HttpError,
  hashPassword,
  type PageResponse,
  verifyPasswordWithUpgrade,
} from "../common/index.js";
import type { UserModel } from "../generated/prisma/models/User.js";
import { toAdminUser, toLoginUserVo, toUserVo } from "./user.mapper.js";
import type {
  AdminUser,
  LoginUserVo,
  UserAddRequest,
  UserLoginRequest,
  UserPageQuery,
  UserRegisterRequest,
  UserUpdateRequest,
  UserVo,
} from "./user.schema.js";
import type { UserRepository } from "./user-repository.js";
import { resolveSortField } from "./user-sorting.js";

export const createUserService = (userRepository: UserRepository) => {
  const requireActiveById = async (id: bigint): Promise<UserModel> => {
    const user = await userRepository.findActiveById(id);
    if (user === null) {
      throw new HttpError(ErrorCode.NotFoundError, "User not found", 404);
    }
    return user;
  };

  const register = async (input: UserRegisterRequest): Promise<string> => {
    const existing = await userRepository.findActiveByAccount(input.userAccount);
    if (existing !== null) {
      throw new HttpError(ErrorCode.ParamsError, "The account already exists");
    }
    const created = await userRepository.createUser({
      userAccount: input.userAccount,
      userPassword: hashPassword(input.userPassword),
    });
    return created.id.toString();
  };

  const login = async (input: UserLoginRequest): Promise<LoginUserVo> => {
    const user = await userRepository.findActiveByAccount(input.userAccount);
    if (user === null) {
      throw new HttpError(
        ErrorCode.ParamsError,
        "The user does not exist or the password is incorrect",
      );
    }
    const verification = verifyPasswordWithUpgrade(input.userPassword, user.userPassword);
    if (!verification.valid) {
      throw new HttpError(
        ErrorCode.ParamsError,
        "The user does not exist or the password is incorrect",
      );
    }
    if (verification.needsRehash) {
      await userRepository.updateById(user.id, {
        userPassword: hashPassword(input.userPassword),
      });
    }
    return toLoginUserVo(user);
  };

  const addUser = async (input: UserAddRequest): Promise<string> => {
    const created = await userRepository.createUser({
      userAccount: input.userAccount,
      userPassword: hashPassword(input.userPassword),
      ...(input.userAvatar !== undefined && { userAvatar: input.userAvatar }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.userRole !== undefined && { userRole: input.userRole }),
    });
    return created.id.toString();
  };

  const updateUser = async (input: UserUpdateRequest): Promise<boolean> => {
    await requireActiveById(input.id);
    await userRepository.updateById(input.id, {
      ...(input.userAvatar !== undefined && { userAvatar: input.userAvatar }),
      ...(input.username !== undefined && { username: input.username }),
      ...(input.userProfile !== undefined && {
        userProfile: input.userProfile,
      }),
      ...(input.userRole !== undefined && { userRole: input.userRole }),
    });
    return true;
  };

  const deleteUser = async (id: bigint): Promise<boolean> => {
    await requireActiveById(id);
    await userRepository.softDeleteById(id);
    return true;
  };

  const getUserVoById = async (id: bigint): Promise<UserVo> =>
    toUserVo(await requireActiveById(id));

  const getUserById = async (id: bigint): Promise<AdminUser> =>
    toAdminUser(await requireActiveById(id));

  const listUserVoByPage = async (query: UserPageQuery): Promise<PageResponse<UserVo>> => {
    const filter = {
      ...(query.id !== undefined && { id: query.id }),
      ...(query.userAccount !== undefined && { userAccount: query.userAccount }),
      ...(query.username !== undefined && { username: query.username }),
      ...(query.userProfile !== undefined && {
        userProfile: query.userProfile,
      }),
      ...(query.userRole !== undefined && { userRole: query.userRole }),
    };
    const [users, total] = await Promise.all([
      userRepository.listActive({
        filter,
        skip: (query.current - 1) * query.pageSize,
        sort: {
          field: resolveSortField(query.sortField),
          order: query.sortOrder === "ascend" ? "asc" : "desc",
        },
        take: query.pageSize,
      }),
      userRepository.countActive(filter),
    ]);
    return createPageResponse(users.map(toUserVo), query, total);
  };

  return {
    addUser,
    deleteUser,
    getUserById,
    getUserVoById,
    listUserVoByPage,
    login,
    register,
    requireActiveById,
    updateUser,
  };
};

export type UserService = ReturnType<typeof createUserService>;

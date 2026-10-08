import type { UserModel } from "../generated/prisma/models/User.js";
import type { AdminUser, LoginUserVo, UserVo } from "./user.schema.js";

export const toUserVo = (entity: UserModel): UserVo => ({
  createTime: entity.createTime,
  id: entity.id.toString(),
  userAccount: entity.userAccount,
  userAvatar: entity.userAvatar,
  username: entity.username,
  userProfile: entity.userProfile,
  userRole: entity.userRole,
});

export const toLoginUserVo = (entity: UserModel): LoginUserVo => ({
  id: entity.id.toString(),
  userAccount: entity.userAccount,
  userAvatar: entity.userAvatar,
  username: entity.username,
  userProfile: entity.userProfile,
  userRole: entity.userRole,
});

export const toAdminUser = (entity: UserModel): AdminUser => ({
  createTime: entity.createTime,
  editTime: entity.editTime,
  id: entity.id.toString(),
  isDelete: entity.isDelete,
  updateTime: entity.updateTime,
  userAccount: entity.userAccount,
  userAvatar: entity.userAvatar,
  username: entity.username,
  userPassword: entity.userPassword,
  userProfile: entity.userProfile,
  userRole: entity.userRole,
});

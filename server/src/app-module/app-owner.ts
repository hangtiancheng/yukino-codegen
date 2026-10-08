import { ErrorCode, HttpError } from "../common/index.js";
import type { AppModel } from "../generated/prisma/models/App.js";

export const requireOwner = (app: AppModel, userId: bigint): void => {
  if (app.userId !== userId) {
    throw new HttpError(ErrorCode.NoAuthError, "Not the owner of the app", 403);
  }
};

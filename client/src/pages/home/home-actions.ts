import { type AppVo, type UserId } from "@/shared/schemas";

export function canManageApp(app: AppVo, userId: UserId | undefined): boolean {
  if (userId === undefined) {
    return false;
  }
  return app.userId === userId;
}

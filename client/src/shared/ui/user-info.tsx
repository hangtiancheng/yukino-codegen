import { type ReactNode } from "react";
import { type UserVo } from "@/shared/schemas";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";

type UserInfoSize = "sm" | "md" | "lg";

export type UserInfoProps = {
  readonly user?: UserVo | undefined;
  readonly size?: UserInfoSize;
  readonly showName?: boolean;
};

const avatarSize: Record<UserInfoSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

export function UserInfo({
  user,
  size = "md",
  showName = true,
}: UserInfoProps): ReactNode {
  const name = user?.username ?? user?.userAccount ?? "Unknown User";
  const fallback = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="inline-flex min-w-0 items-center gap-2">
      <Avatar size={avatarSize[size]}>
        {user?.userAvatar ? <AvatarImage src={user.userAvatar} alt="" /> : null}
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {fallback}
        </AvatarFallback>
      </Avatar>
      {showName ? (
        <span className="text-foreground truncate text-sm font-medium">
          {name}
        </span>
      ) : null}
    </div>
  );
}

import { create } from "zustand";
import { ApiException, getCurrentUser } from "@/shared/api";
import { type LoginUserVo } from "@/shared/schemas";

export type UserStoreState = {
  readonly status: "idle" | "loading" | "authenticated" | "anonymous";
  readonly user: LoginUserVo | null;
  readonly hydrate: () => Promise<void>;
  readonly setUser: (user: LoginUserVo) => void;
  readonly clear: () => void;
};

export const useUserStore = create<UserStoreState>((set) => ({
  status: "idle",
  user: null,
  hydrate: async () => {
    set({ status: "loading" });
    try {
      const user = await getCurrentUser();
      set({ status: "authenticated", user });
    } catch (cause) {
      if (
        cause instanceof ApiException &&
        (cause.error.kind === "unauthorized" || cause.error.kind === "business")
      ) {
        set({ status: "anonymous", user: null });
        return;
      }
      set({ status: "anonymous", user: null });
      throw cause;
    }
  },
  setUser: (user) => {
    set({ status: "authenticated", user });
  },
  clear: () => {
    set({ status: "anonymous", user: null });
  },
}));

export function selectIsAdmin(state: UserStoreState): boolean {
  return state.user?.userRole === "admin";
}

export function selectIsAuthenticated(state: UserStoreState): boolean {
  return state.status === "authenticated" && state.user !== null;
}

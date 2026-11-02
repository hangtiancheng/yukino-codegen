import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeManager } from "../src/agent-runtime/index.js";
import type { AppService } from "../src/app-module/index.js";
import { UserRole } from "../src/generated/prisma/enums.js";
import { handleError } from "../src/middleware/error-handler.js";
import { registerWorkspaceRoutes } from "../src/routes/workspace-routes.js";
import type { AppHonoEnv } from "../src/session/index.js";
import type { WorkspaceManager } from "../src/workspace/workspace-manager.js";

async function fixture() {
  const app = new Hono<AppHonoEnv>();
  app.onError(handleError);
  app.use("*", async (c, next) => {
    const role = c.req.header("cookie");
    if (role !== undefined)
      c.set("user", {
        id: role === "user=viewer" ? "2" : "1",
        userAccount: "test",
        username: "test",
        userAvatar: null,
        userProfile: null,
        userRole: role === "user=admin" ? UserRole.ADMIN : UserRole.USER,
      });
    await next();
  });
  const runtime = {
    isBusy: false,
    touch: vi.fn(),
    runExclusive: vi.fn(async (task: () => Promise<void>) => task()),
  };
  const workspaces = {
    build: vi.fn().mockResolvedValue({ status: "building", logs: "build output", revision: 1 }),
    status: vi.fn().mockReturnValue({ status: "ready", logs: "", revision: 3, path: "/p/test/3/" }),
  };
  registerWorkspaceRoutes(app, {
    appService: {
      requireActiveById: vi.fn().mockResolvedValue({ id: 1n, userId: 1n }),
    } as unknown as AppService,
    manager: { getOrCreate: vi.fn().mockResolvedValue(runtime) } as unknown as RuntimeManager,
    workspaces: workspaces as unknown as WorkspaceManager,
  });
  return { app, runtime, workspaces };
}

describe("workspace preview API", () => {
  it("requires login and builds through the authenticated API", async () => {
    const { app, workspaces } = await fixture();
    expect((await app.request("/1/workspace/preview")).status).toBe(401);
    const response = await app.request("/1/workspace/preview", {
      method: "POST",
      headers: { cookie: "user=owner" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: "building", logs: "build output" },
    });
    expect(workspaces.build).toHaveBeenCalledWith(1n, expect.any(Function));
  });

  it("reports the current preview state to read-only viewers without rebuilding", async () => {
    const { app, workspaces } = await fixture();
    const response = await app.request("/1/workspace/preview", {
      headers: { cookie: "user=viewer" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: "ready", revision: 3 },
    });
    expect(workspaces.build).not.toHaveBeenCalled();
  });

  it("rejects invalid app ids", async () => {
    const { app } = await fixture();
    const response = await app.request("/not-an-id/workspace/preview", {
      headers: { cookie: "user=owner" },
    });
    expect(response.status).toBe(400);
  });
});

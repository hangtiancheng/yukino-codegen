import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { RuntimeManager } from "../src/agent-runtime/index.js";
import type { AppService } from "../src/app-module/index.js";
import { UserRole } from "../src/generated/prisma/enums.js";
import { handleError } from "../src/middleware/error-handler.js";
import { registerWorkspaceRoutes } from "../src/routes/workspace-routes.js";
import type { AppHonoEnv } from "../src/session/index.js";
import type { WorkspaceManager } from "../src/workspace/workspace-manager.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function fixture() {
  const app = new Hono<AppHonoEnv>();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
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
  const terminal = {
    write: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    completion: Promise.resolve(),
  };
  const runtime = {
    isBusy: false,
    touch: vi.fn(),
    runExclusive: vi.fn(async (task: () => Promise<void>) => task()),
  };
  const workspaces = {
    build: vi.fn().mockResolvedValue({ status: "building", logs: "build output", revision: 1 }),
    status: vi.fn().mockReturnValue({ status: "ready", logs: "", revision: 1, path: "/p/test/1/" }),
    openTerminal: vi.fn().mockResolvedValue(terminal),
  };
  registerWorkspaceRoutes(app, {
    appService: {
      requireActiveById: vi.fn().mockResolvedValue({ id: 1n, userId: 1n }),
    } as unknown as AppService,
    manager: { getOrCreate: vi.fn().mockResolvedValue(runtime) } as unknown as RuntimeManager,
    workspaces: workspaces as unknown as WorkspaceManager,
    upgradeWebSocket,
  });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  injectWebSocket(server);
  if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No port");
  const origin = `http://127.0.0.1:${address.port}`;
  const sockets: WebSocket[] = [];
  const connect = (cookie?: string, customOrigin = origin) => {
    const ws = new WebSocket(origin.replace("http", "ws") + "/1/workspace/terminal", {
      headers: { origin: customOrigin, ...(cookie === undefined ? {} : { cookie }) },
    });
    sockets.push(ws);
    return ws;
  };
  cleanup.push(async () => {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { app, runtime, terminal, workspaces, origin, connect };
}

describe("workspace API authentication and terminal contract", () => {
  it("requires login for preview and returns build state through the authenticated API", async () => {
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

  it("rejects anonymous, read-only and foreign-origin terminal connections", async () => {
    const { connect, workspaces } = await fixture();
    for (const [cookie, origin] of [
      [undefined, undefined],
      ["user=viewer", undefined],
      ["user=owner", "https://untrusted.example"],
    ]) {
      const ws = connect(cookie, origin);
      const code = await new Promise<number>((resolve) => ws.once("close", resolve));
      expect(code).toBe(1008);
    }
    expect(workspaces.openTerminal).not.toHaveBeenCalled();
  });

  it("forwards validated input and resize, blocks input while busy and disposes on disconnect", async () => {
    const { connect, workspaces, runtime, terminal } = await fixture();
    const ws = connect("user=owner");
    const ready = await new Promise<string>((resolve) =>
      ws.once("message", (data) => resolve(data.toString())),
    );
    expect(JSON.parse(ready)).toEqual({ type: "ready" });
    expect(workspaces.openTerminal).toHaveBeenCalledWith(
      1n,
      80,
      24,
      expect.any(Function),
      expect.any(Function),
    );
    ws.send(JSON.stringify({ type: "input", data: "pwd\r" }));
    ws.send(JSON.stringify({ type: "resize", cols: 101, rows: 33 }));
    await vi.waitFor(() => expect(terminal.write).toHaveBeenCalledWith("pwd\r"));
    expect(terminal.resize).toHaveBeenCalledWith(101, 33);
    runtime.isBusy = true;
    ws.send(JSON.stringify({ type: "input", data: "blocked\r" }));
    ws.send(JSON.stringify({ type: "resize", cols: 102, rows: 34 }));
    await vi.waitFor(() => expect(terminal.resize).toHaveBeenCalledWith(102, 34));
    expect(terminal.write).toHaveBeenCalledTimes(1);
    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.close();
    await closed;
    await vi.waitFor(() => expect(terminal.dispose).toHaveBeenCalled());
  });
});

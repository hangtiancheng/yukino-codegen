import type { NodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { RuntimeManager } from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import type { AppHonoEnv } from "../session/index.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";
import { registerAgentCapabilityRoutes } from "./agent-capability-routes.js";
import { registerAgentMcpRoutes } from "./agent-mcp-routes.js";
import { registerAgentWs } from "./agent-ws.js";
import { registerWorkspaceRoutes } from "./workspace-routes.js";

export type AgentRoutesDeps = Readonly<{
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
  manager: RuntimeManager;
  appService: AppService;
  workspaces: WorkspaceManager;
}>;

export const createAgentRoutes = (deps: AgentRoutesDeps) => {
  const router = new Hono<AppHonoEnv>();
  registerAgentWs(router, {
    appService: deps.appService,
    manager: deps.manager,
    upgradeWebSocket: deps.upgradeWebSocket,
  });
  registerAgentMcpRoutes(router, { appService: deps.appService, manager: deps.manager });
  registerAgentCapabilityRoutes(router, { appService: deps.appService, manager: deps.manager });
  registerWorkspaceRoutes(router, {
    appService: deps.appService,
    manager: deps.manager,
    workspaces: deps.workspaces,
  });
  return router;
};

export type AgentRoutes = ReturnType<typeof createAgentRoutes>;

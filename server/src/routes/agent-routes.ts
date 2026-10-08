import type { NodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { RuntimeManager } from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import type { AppHonoEnv } from "../session/index.js";
import { registerAgentCapabilityRoutes } from "./agent-capability-routes.js";
import { registerAgentFileRoutes } from "./agent-files.js";
import { registerAgentMcpRoutes } from "./agent-mcp-routes.js";
import { registerAgentWs } from "./agent-ws.js";

export type AgentRoutesDeps = Readonly<{
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
  manager: RuntimeManager;
  appService: AppService;
}>;

/**
 * Composes the agent surface mounted under `/app`: the WebSocket transport, MCP
 * config REST, capability REST, and the project file API.
 */
export const createAgentRoutes = (deps: AgentRoutesDeps) => {
  const router = new Hono<AppHonoEnv>();
  registerAgentWs(router, {
    appService: deps.appService,
    manager: deps.manager,
    upgradeWebSocket: deps.upgradeWebSocket,
  });
  registerAgentMcpRoutes(router, { appService: deps.appService, manager: deps.manager });
  registerAgentCapabilityRoutes(router, { appService: deps.appService, manager: deps.manager });
  registerAgentFileRoutes(router, { appService: deps.appService, manager: deps.manager });
  return router;
};

export type AgentRoutes = ReturnType<typeof createAgentRoutes>;

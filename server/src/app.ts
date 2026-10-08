import { createNodeWebSocket, type NodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { RuntimeManager } from "./agent-runtime/index.js";
import type { AppService } from "./app-module/index.js";
import { env } from "./config/index.js";
import type { PrismaDatabaseClient } from "./database/index.js";
import {
  createBodyLimitMiddleware,
  createCorsMiddleware,
  handleError,
  handleNotFound,
} from "./middleware/index.js";
import type { HealthService, MetricsService, RequestLogger } from "./observability/index.js";
import { createRequestContextMiddleware } from "./observability/index.js";
import {
  createAgentRoutes,
  createAppRoutes,
  createChatHistoryRoutes,
  createManagementRoutes,
  createUserRoutes,
  healthRoutes,
} from "./routes/index.js";
import { type AppHonoEnv, type SessionStore, sessionMiddleware } from "./session/index.js";
import type { UserService } from "./user/index.js";

export type AppDependencies = Readonly<{
  appService: AppService;
  db: PrismaDatabaseClient;
  healthService: HealthService;
  metricsService: MetricsService;
  projectRootDir?: string;
  requestLogger?: RequestLogger;
  runtimeManager: RuntimeManager;
  sessionStore: SessionStore;
  shutdown?: () => Promise<void>;
  userService: UserService;
}>;

export { createDefaultDependencies } from "./app-dependencies.js";

export type CreatedApp = Readonly<{
  app: Hono<AppHonoEnv>;
  injectWebSocket: NodeWebSocket["injectWebSocket"];
}>;

export const createApp = (deps: AppDependencies): CreatedApp => {
  const app = new Hono<AppHonoEnv>();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
  const api = new Hono<AppHonoEnv>();

  app.onError(handleError);
  app.notFound(handleNotFound);
  app.use("*", createCorsMiddleware());
  app.use("*", createBodyLimitMiddleware());
  app.use("*", createRequestContextMiddleware(deps.requestLogger));
  app.use("*", sessionMiddleware(deps.sessionStore));

  api.route("/", healthRoutes);
  api.route(
    "/user",
    createUserRoutes({
      sessionStore: deps.sessionStore,
      userService: deps.userService,
    }),
  );
  api.route(
    "/app",
    createAppRoutes({
      appService: deps.appService,
      ...(deps.projectRootDir !== undefined && {
        projectRootDir: deps.projectRootDir,
      }),
    }),
  );
  api.route(
    "/app",
    createAgentRoutes({
      appService: deps.appService,
      manager: deps.runtimeManager,
      upgradeWebSocket,
    }),
  );
  api.route("/chat-history", createChatHistoryRoutes({ appService: deps.appService, db: deps.db }));
  api.route(
    "/management",
    createManagementRoutes({
      healthService: deps.healthService,
      metricsService: deps.metricsService,
    }),
  );
  app.route(`/${env.BASE_URL}`, api);

  return { app, injectWebSocket };
};

export type AppType = CreatedApp["app"];

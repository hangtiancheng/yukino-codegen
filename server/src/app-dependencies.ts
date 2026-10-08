import { Redis } from "ioredis";
import { buildProviderConfig, createRuntimeManager } from "./agent-runtime/index.js";
import type { AppDependencies } from "./app.js";
import {
  createDatabaseHealthCheck,
  createModelProviderHealthCheck,
  createRedisHealthCheck,
} from "./app-health-checks.js";
import { type AppRepository, createAppRepository, createAppService } from "./app-module/index.js";
import { createDefaultShutdown } from "./app-shutdown.js";
import { createConfiguredStorage } from "./app-storage.js";
import { env } from "./config/index.js";
import { createPrismaClient } from "./database/index.js";
import { createStorageHealthCheck } from "./deployment/index.js";
import { createHealthService, createMetricsService } from "./observability/index.js";
import { createInMemorySessionStore, createRedisSessionStore } from "./session/index.js";
import { createUserRepository, createUserService } from "./user/index.js";

const createRedisClient = () =>
  env.REDIS_URL === undefined
    ? undefined
    : new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const createDefaultHealthChecks = (
  db: ReturnType<typeof createPrismaClient>,
  providerConfig: ReturnType<typeof buildProviderConfig>,
  redisClient: Redis | undefined,
  storageHealthProbe: ReturnType<typeof createConfiguredStorage>["healthProbe"],
) => [
  createDatabaseHealthCheck(db),
  ...(env.MODEL_PROVIDER_HEALTH_CHECK_ENABLED
    ? [createModelProviderHealthCheck(providerConfig, env.MODEL_PROVIDER_HEALTH_CHECK_TIMEOUT_MS)]
    : []),
  createRedisHealthCheck(redisClient),
  createStorageHealthCheck(storageHealthProbe),
];

export const createDefaultDependencies = (): AppDependencies => {
  const db = createPrismaClient();
  const redisClient = createRedisClient();
  const metricsService = createMetricsService();
  const appRepository: AppRepository = createAppRepository(db);
  const providerConfig = buildProviderConfig(env);
  const { healthProbe: storageHealthProbe } = createConfiguredStorage();
  const runtimeManager = createRuntimeManager({ db, metrics: metricsService });
  const baseShutdown = createDefaultShutdown({
    database: db,
    ...(redisClient !== undefined && { redisClient }),
  });

  return {
    appService: createAppService(appRepository),
    db,
    healthService: createHealthService(
      createDefaultHealthChecks(db, providerConfig, redisClient, storageHealthProbe),
    ),
    metricsService,
    runtimeManager,
    sessionStore:
      redisClient === undefined
        ? createInMemorySessionStore()
        : createRedisSessionStore(redisClient),
    shutdown: async () => {
      await runtimeManager.disposeAll();
      await baseShutdown();
    },
    userService: createUserService(createUserRepository(db)),
  };
};

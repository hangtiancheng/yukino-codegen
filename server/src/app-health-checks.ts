import { type Config, Conversation, LLM } from "@yukino.js/yukino";
import type { Redis } from "ioredis";
import type { PrismaDatabaseClient } from "./database/index.js";
import type { HealthCheck } from "./observability/index.js";

export const createDatabaseHealthCheck = (db: PrismaDatabaseClient): HealthCheck => ({
  name: "database",
  probe: async () => {
    try {
      await db.$connect();
      return "up";
    } catch {
      return "down";
    }
  },
});

export const createRedisHealthCheck = (redisClient: Redis | undefined): HealthCheck => ({
  name: "redis",
  probe: async () => {
    if (redisClient === undefined) return "up";
    try {
      await redisClient.ping();
      return "up";
    } catch {
      return "down";
    }
  },
});

const withTimeout = async (operation: Promise<unknown>, timeoutMs: number): Promise<void> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("Model provider health check timed out")),
      timeoutMs,
    );
  });
  try {
    await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

const probeModelProvider = async (
  providerConfig: Config.ProviderConfig.ProviderConfig,
): Promise<void> => {
  const client = await LLM.Client.createClient(
    providerConfig,
    "You are a health probe. Reply with ok.",
  );
  const conversation = new Conversation.ConversationManager();
  conversation.addUserMessage("Reply with ok.");
  for await (const event of client.stream(conversation, [])) {
    if (event.type === "stream_end") return;
  }
};

export const createModelProviderHealthCheck = (
  providerConfig: Config.ProviderConfig.ProviderConfig,
  timeoutMs: number,
): HealthCheck => ({
  name: "modelProvider",
  probe: async () => {
    try {
      await withTimeout(probeModelProvider(providerConfig), timeoutMs);
      return "up";
    } catch {
      return "down";
    }
  },
});

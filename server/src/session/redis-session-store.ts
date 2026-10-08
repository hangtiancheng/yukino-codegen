import { type SessionPayload, sessionPayloadSchema } from "./session.schema.js";
import type { SessionStore } from "./session-store.js";

export type RedisSessionClient = Readonly<{
  del: (key: string) => Promise<number>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<"OK" | null>;
}>;

export type RedisSessionStoreConfig = Readonly<{
  keyPrefix?: string;
  now?: () => number;
}>;

const defaultKeyPrefix = "session:";

const sessionKey = (prefix: string, sessionId: string): string => `${prefix}${sessionId}`;

const ttlSeconds = (payload: SessionPayload, now: number): number =>
  Math.ceil((payload.expiresAt - now) / 1000);

export const createRedisSessionStore = (
  client: RedisSessionClient,
  config: RedisSessionStoreConfig = {},
): SessionStore => {
  const keyPrefix = config.keyPrefix ?? defaultKeyPrefix;
  const now = config.now ?? Date.now;

  return {
    delete: async (sessionId) => {
      await client.del(sessionKey(keyPrefix, sessionId));
    },
    get: async (sessionId) => {
      const key = sessionKey(keyPrefix, sessionId);
      const value = await client.get(key);
      if (value === null) return undefined;
      try {
        const parsed: unknown = JSON.parse(value);
        const payload = sessionPayloadSchema.parse(parsed);
        if (payload.expiresAt <= now()) {
          await client.del(key);
          return undefined;
        }
        return payload;
      } catch {
        await client.del(key);
        return undefined;
      }
    },
    set: async (sessionId, payload) => {
      const seconds = ttlSeconds(payload, now());
      const key = sessionKey(keyPrefix, sessionId);
      if (seconds <= 0) {
        await client.del(key);
        return;
      }
      await client.set(key, JSON.stringify(payload), "EX", seconds);
    },
  };
};

import type { SessionPayload } from "./session.schema.js";

export type SessionStore = Readonly<{
  delete: (sessionId: string) => Promise<void>;
  get: (sessionId: string) => Promise<SessionPayload | undefined>;
  set: (sessionId: string, payload: SessionPayload) => Promise<void>;
}>;

export const createInMemorySessionStore = (): SessionStore => {
  const store = new Map<string, SessionPayload>();

  const isExpired = (payload: SessionPayload): boolean =>
    payload.expiresAt > 0 && payload.expiresAt < Date.now();

  return {
    delete: async (sessionId) => {
      store.delete(sessionId);
      return Promise.resolve();
    },
    get: async (sessionId) => {
      const payload = store.get(sessionId);
      if (payload === undefined) {
        return Promise.resolve(undefined);
      }
      if (isExpired(payload)) {
        store.delete(sessionId);
        return Promise.resolve(undefined);
      }
      return Promise.resolve(payload);
    },
    set: async (sessionId, payload) => {
      store.set(sessionId, payload);
      return Promise.resolve();
    },
  };
};

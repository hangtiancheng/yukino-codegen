import { getRuntimeEnv } from "./runtime-env";

const ABSOLUTE_URL = /^(?:https?|wss?):\/\//iu;

function currentOrigin(): string {
  return globalOrigin(globalThis) ?? "http://localhost:3000";
}

/**
 * Read `location.origin` through a structural parameter type so this module
 * also compiles under the node tsconfig (used by tests), which has no DOM lib.
 * The index signature keeps the parameter from being a "weak type" that
 * `globalThis` (no `location` under node) would fail to satisfy.
 */
function globalOrigin(global: {
  location?: { origin?: string };
  [key: string]: unknown;
}): string | undefined {
  return global.location?.origin;
}

export function getApiBaseUrl(): string {
  const configured = getRuntimeEnv().VITE_API_BASE_URL;
  if (ABSOLUTE_URL.test(configured)) return configured;
  return `${currentOrigin()}${configured.startsWith("/") ? configured : `/${configured}`}`;
}

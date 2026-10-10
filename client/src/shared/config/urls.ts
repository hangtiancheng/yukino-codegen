import { getRuntimeEnv } from "./runtime-env";

const ABSOLUTE_URL = /^(?:https?|wss?):\/\//iu;

function currentOrigin(): string {
  return globalOrigin(globalThis) ?? "http://localhost:3000";
}

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

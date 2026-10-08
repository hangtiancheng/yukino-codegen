import { ApiException } from "./api-error";

export const unauthorizedCode = 40100;

export type RedirectHandler = (currentUrl: string) => void;

let handler: RedirectHandler | null = null;

export function setUnauthorizedRedirectHandler(next: RedirectHandler): void {
  handler = next;
}

export function clearUnauthorizedRedirectHandler(): void {
  handler = null;
}

export function notifyUnauthorized(currentUrl: string): void {
  if (handler) {
    handler(currentUrl);
  }
}

export function isUnauthorizedException(error: unknown): error is ApiException {
  return error instanceof ApiException && error.error.kind === "unauthorized";
}

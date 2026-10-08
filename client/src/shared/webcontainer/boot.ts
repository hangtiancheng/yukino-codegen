import { WebContainer } from "@webcontainer/api";

let bootPromise: Promise<WebContainer> | undefined;

export function getWebContainer(): Promise<WebContainer> {
  if (bootPromise !== undefined) return bootPromise;
  if (Reflect.get(globalThis, "crossOriginIsolated") !== true) {
    return Promise.reject(
      new Error(
        "WebContainer requires cross-origin isolation. Reload after enabling COOP/COEP headers.",
      ),
    );
  }
  bootPromise = WebContainer.boot({
    coep: "credentialless",
    forwardPreviewErrors: true,
    workdirName: "project",
  }).catch((error: unknown) => {
    bootPromise = undefined;
    throw error;
  });
  return bootPromise;
}

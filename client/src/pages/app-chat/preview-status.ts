export type PreviewStatus =
  "idle" | "installing" | "building" | "ready" | "failed";

const statusMessages: Readonly<Record<PreviewStatus, string>> = {
  idle: "Generate once to preview.",
  installing: "Installing dependencies on the server...",
  building: "Building the app on the server...",
  ready: "Previewing the latest successful build.",
  failed: "Preview failed to start.",
};

export const getPreviewStatusMessage = (status: PreviewStatus): string =>
  statusMessages[status];

export type PreviewStatus =
  | "idle"
  | "booting"
  | "mounting"
  | "installing"
  | "starting"
  | "ready"
  | "failed";

const statusMessages: Readonly<Record<PreviewStatus, string>> = {
  idle: "Generate once to preview.",
  booting: "Starting browser runtime...",
  mounting: "Syncing project files...",
  installing: "Installing dependencies in your browser...",
  starting: "Starting Vite dev server...",
  ready: "Vite preview is running in your browser.",
  failed: "Preview failed to start.",
};

export const getPreviewStatusMessage = (status: PreviewStatus): string =>
  statusMessages[status];

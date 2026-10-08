export type PreviewRuntimeError = Readonly<{
  message: string;
  stack?: string;
}>;

export const buildPreviewFixPrompt = (error: PreviewRuntimeError): string =>
  [
    "Fix the generated React app error below. Inspect the current project, make the smallest correct change, and keep all unrelated behavior intact.",
    "",
    `Error: ${error.message}`,
    ...(error.stack === undefined ? [] : ["", "Stack:", error.stack]),
  ].join("\n");

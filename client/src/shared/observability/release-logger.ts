export type RuntimeIssueKind =
  | "root-error"
  | "stream-failure"
  | "schema-parse-failure"
  | "preview-runtime-failure";

export type RuntimeIssue = {
  readonly kind: RuntimeIssueKind;
  readonly message: string;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
  readonly cause?: unknown;
};

export function reportRuntimeIssue(issue: RuntimeIssue): void {
  globalThis.console.error("[release-safety]", {
    kind: issue.kind,
    message: issue.message,
    context: issue.context ?? {},
    cause: issue.cause,
  });
}

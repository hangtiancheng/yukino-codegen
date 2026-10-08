export const apiErrorKinds = {
  network: "network",
  http: "http",
  business: "business",
  parse: "parse",
  unauthorized: "unauthorized",
  aborted: "aborted",
} as const;

export type ApiErrorKind = (typeof apiErrorKinds)[keyof typeof apiErrorKinds];

export type ApiError = Readonly<
  | { kind: "network"; message: string; cause?: unknown }
  | { kind: "http"; status: number; message: string }
  | { kind: "business"; code: number; message: string }
  | { kind: "parse"; message: string; issues: ReadonlyArray<string> }
  | { kind: "unauthorized"; code: number; message: string }
  | { kind: "aborted"; message: string }
>;

export class ApiException extends Error {
  readonly error: ApiError;

  constructor(error: ApiError) {
    super(error.kind === "network" ? error.message : describeApiError(error));
    this.name = "ApiException";
    this.error = error;
  }
}

export function isApiExceptionWithStatus(
  cause: unknown,
  status: number,
): cause is ApiException {
  return (
    cause instanceof ApiException &&
    cause.error.kind === "http" &&
    cause.error.status === status
  );
}

export function describeApiError(error: ApiError): string {
  switch (error.kind) {
    case "network":
      return `Network error: ${error.message}`;
    case "http":
      return `HTTP ${error.status}: ${error.message}`;
    case "business":
      return `[${error.code}] ${error.message}`;
    case "parse":
      return `Invalid response shape: ${error.message}`;
    case "unauthorized":
      return error.message;
    case "aborted":
      return error.message;
  }
}

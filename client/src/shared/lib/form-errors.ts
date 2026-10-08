export function getFirstErrorMessage(
  errors: ReadonlyArray<unknown>,
): string | undefined {
  if (errors.length === 0) {
    return undefined;
  }
  const first = errors[0];
  if (first === undefined || first === null) {
    return undefined;
  }
  if (typeof first === "string") {
    return first;
  }
  if (hasStringMessage(first)) {
    return first.message;
  }
  return undefined;
}

function hasStringMessage(
  value: unknown,
): value is { readonly message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

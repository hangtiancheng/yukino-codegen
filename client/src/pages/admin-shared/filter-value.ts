export function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function optionalPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const numericValue = Number(trimmed);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return undefined;
  }
  return numericValue;
}

export function formatNullable(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : "Not set";
}

export function formatTimestamp(value: string | undefined): string {
  if (value === undefined) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function readStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function formatLineRange(startLine: unknown, endLine: unknown): string {
  const start = typeof startLine === "number" && Number.isFinite(startLine) ? Math.trunc(startLine) : undefined;
  const end = typeof endLine === "number" && Number.isFinite(endLine) ? Math.trunc(endLine) : undefined;

  if (start && end) {
    return `:${start}-${end}`;
  }

  if (start) {
    return `:${start}+`;
  }

  return "";
}

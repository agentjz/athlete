const MAX_REASON_ITEMS = 6;
const MAX_REASON_TEXT_CHARS = 220;

export function takeLastUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeText(values[index]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.unshift(normalized);
    if (result.length >= MAX_REASON_ITEMS) {
      break;
    }
  }

  return result;
}

export function truncate(value: string): string {
  return value.length <= MAX_REASON_TEXT_CHARS ? value : `${value.slice(0, MAX_REASON_TEXT_CHARS)}...`;
}

export function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function clampWholeNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number | undefined,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function normalizeExitCode(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return clampWholeNumber(value, -999_999, 999_999, undefined);
}

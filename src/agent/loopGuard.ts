import type { ToolCallRecord, ToolExecutionResult } from "../types.js";

const MAX_IDENTICAL_TOOL_CALLS = 2;

export class ToolLoopGuard {
  private readonly counts = new Map<string, number>();

  reset(): void {
    this.counts.clear();
  }

  getBlockedResult(toolCall: ToolCallRecord): ToolExecutionResult | null {
    const signature = buildToolCallSignature(toolCall);
    const nextCount = (this.counts.get(signature) ?? 0) + 1;
    this.counts.set(signature, nextCount);

    if (nextCount <= MAX_IDENTICAL_TOOL_CALLS) {
      return null;
    }

    return {
      ok: false,
      output: JSON.stringify(
        {
          ok: false,
          error: `Loop guard blocked repeated ${toolCall.function.name} calls with identical arguments.`,
          code: "LOOP_GUARD_BLOCKED",
          hint: "Do not retry the same tool call again. Re-read recent results, change the path or arguments, or choose a different tool.",
          repeatedCount: nextCount,
        },
        null,
        2,
      ),
    };
  }
}

function buildToolCallSignature(toolCall: ToolCallRecord): string {
  return `${toolCall.function.name}:${normalizeJsonLike(toolCall.function.arguments)}`;
}

function normalizeJsonLike(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(sortJsonValue(parsed));
  } catch {
    return raw.trim().replace(/\s+/g, " ");
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}

import type { ToolExecutionResult } from "../../../types.js";

const DEFAULT_BLOCK_HINT = "The tool call was blocked by the harness before execution.";
const DEFAULT_BLOCK_NEXT_STEP = "Review the blocked reason, adjust the tool arguments or choose another valid action, and continue the task.";

export function ensureBlockedResultHasContinuation(result: ToolExecutionResult): ToolExecutionResult {
  if (result.ok) {
    return result;
  }

  const payload = readJsonObject(result.output);
  if (!payload) {
    return result;
  }

  const normalized = {
    ...payload,
    hint: readNonEmptyString(payload.hint) ?? DEFAULT_BLOCK_HINT,
    next_step: readNonEmptyString(payload.next_step) ?? DEFAULT_BLOCK_NEXT_STEP,
  };

  return {
    ...result,
    output: JSON.stringify(normalized, null, 2),
  };
}

function readJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

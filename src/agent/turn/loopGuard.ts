import type { ToolCallRecord, ToolExecutionResult } from "../../types.js";

const MAX_IDENTICAL_OBSERVATIONS = 2;

const VOLATILE_STATE_TOOLS = new Set([
  "read_inbox",
  "list_teammates",
  "background_check",
  "task_list",
  "task_get",
  "worktree_events",
  "worktree_list",
  "worktree_get",
  "shutdown_response",
  "plan_approval",
]);

interface ToolLoopObservation {
  resultSignature: string;
  identicalCount: number;
}

export class ToolLoopGuard {
  private readonly observations = new Map<string, ToolLoopObservation>();

  reset(): void {
    this.observations.clear();
  }

  getPreflightBlockedResult(toolCall: ToolCallRecord): ToolExecutionResult | null {
    if (isVolatileStateTool(toolCall.function.name)) {
      return null;
    }

    const observation = this.observations.get(buildToolCallSignature(toolCall));
    if (!observation || observation.identicalCount < MAX_IDENTICAL_OBSERVATIONS) {
      return null;
    }

    if (isObservationTool(toolCall.function.name)) {
      return null;
    }

    return buildBlockedResult(toolCall, observation.identicalCount + 1);
  }

  noteToolResult(toolCall: ToolCallRecord, result: ToolExecutionResult): ToolExecutionResult | null {
    if (isVolatileStateTool(toolCall.function.name) || isLoopGuardBlockedResult(result)) {
      return null;
    }

    const actionSignature = buildToolCallSignature(toolCall);
    const resultSignature = buildToolResultSignature(result);
    const previous = this.observations.get(actionSignature);
    const identicalCount = previous?.resultSignature === resultSignature
      ? previous.identicalCount + 1
      : 1;
    this.observations.set(actionSignature, {
      resultSignature,
      identicalCount,
    });

    if (identicalCount <= MAX_IDENTICAL_OBSERVATIONS || !isObservationTool(toolCall.function.name)) {
      return null;
    }

    return buildBlockedResult(toolCall, identicalCount);
  }
}

function buildBlockedResult(toolCall: ToolCallRecord, repeatedCount: number): ToolExecutionResult {
  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        error: `Loop guard blocked repeated ${toolCall.function.name} calls with identical arguments and the same result.`,
        code: "LOOP_GUARD_BLOCKED",
        hint: "Repeated identical tool call and identical result without new progress.",
        repeatedCount,
      },
      null,
      2,
    ),
  };
}

function isObservationTool(toolName: string): boolean {
  return toolName.startsWith("read_")
    || toolName.startsWith("list_")
    || toolName.startsWith("find_")
    || toolName.startsWith("search_")
    || toolName.startsWith("openapi_")
    || toolName.startsWith("mineru_")
    || toolName === "http_probe"
    || toolName === "http_request"
    || toolName === "http_suite"
    || toolName === "network_trace";
}

function isVolatileStateTool(toolName: string): boolean {
  return VOLATILE_STATE_TOOLS.has(toolName);
}

function isLoopGuardBlockedResult(result: ToolExecutionResult): boolean {
  if (result.ok) {
    return false;
  }

  try {
    const payload = JSON.parse(result.output) as unknown;
    return Boolean(
      payload
      && typeof payload === "object"
      && !Array.isArray(payload)
      && (payload as Record<string, unknown>).code === "LOOP_GUARD_BLOCKED",
    );
  } catch {
    return false;
  }
}

function buildToolCallSignature(toolCall: ToolCallRecord): string {
  return `${toolCall.function.name}:${normalizeJsonLike(toolCall.function.arguments)}`;
}

function buildToolResultSignature(result: ToolExecutionResult): string {
  return normalizeJsonLike(JSON.stringify({
    ok: result.ok,
    output: result.output,
  }));
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

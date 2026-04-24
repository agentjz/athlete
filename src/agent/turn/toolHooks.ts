import type {
  AfterToolCallHookContext,
  AfterToolCallHookResult,
  AgentCallbacks,
  BeforeToolCallHookContext,
  BeforeToolCallHookResult,
} from "../types.js";
import type { ToolExecutionProtocolMetadata, ToolExecutionResult } from "../../types.js";

export async function runBeforeToolCallHook(
  callbacks: AgentCallbacks | undefined,
  context: BeforeToolCallHookContext,
): Promise<BeforeToolCallHookResult | undefined> {
  const result = await callbacks?.beforeToolCall?.(context);
  return result ?? undefined;
}

export async function runAfterToolCallHook(
  callbacks: AgentCallbacks | undefined,
  context: AfterToolCallHookContext,
): Promise<AfterToolCallHookResult | undefined> {
  const result = await callbacks?.afterToolCall?.(context);
  return result ?? undefined;
}

export function buildToolHookErrorResult(
  code: "TOOL_HOOK_BLOCKED" | "TOOL_HOOK_FAILED",
  message: string,
): ToolExecutionResult {
  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        code,
        error: message,
      },
      null,
      2,
    ),
  };
}

export function attachProtocolToToolResult(
  result: ToolExecutionResult,
  protocol: ToolExecutionProtocolMetadata | undefined,
): ToolExecutionResult {
  if (!protocol) {
    return result;
  }

  try {
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          protocol,
        },
      };
    }

    return {
      ...result,
      output: JSON.stringify(
        {
          ...parsed,
          protocol,
        },
        null,
        2,
      ),
      metadata: {
        ...(result.metadata ?? {}),
        protocol,
      },
    };
  } catch {
    return {
      ...result,
      metadata: {
        ...(result.metadata ?? {}),
        protocol,
      },
    };
  }
}

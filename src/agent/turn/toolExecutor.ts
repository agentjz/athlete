import type { ChangeStore } from "../changes/store.js";
import { ToolExecutionError } from "../../tools/core/errors.js";
import { createToolRegistry } from "../../tools/index.js";
import type { ProjectContext, SessionRecord, ToolCallRecord, ToolExecutionResult } from "../../types.js";
import type { RunTurnOptions } from "../types.js";
import { isAbortError } from "../../utils/abort.js";

export async function executeToolCallWithRecovery(
  toolRegistry: ReturnType<typeof createToolRegistry>,
  toolCall: ToolCallRecord,
  options: RunTurnOptions,
  session: SessionRecord,
  projectContext: ProjectContext,
  changeStore: ChangeStore,
): Promise<ToolExecutionResult> {
  try {
    return await toolRegistry.execute(toolCall.function.name, toolCall.function.arguments, {
      config: options.config,
      cwd: options.cwd,
      sessionId: session.id,
      identity: options.identity ?? {
        kind: "lead",
        name: "lead",
      },
      callbacks: options.callbacks,
      abortSignal: options.abortSignal,
      runtimeState: {
        todoItems: session.todoItems,
      },
      projectContext,
      changeStore,
      createToolRegistry,
    });
  } catch (error) {
    return buildToolExecutionFailureResult(toolCall, error);
  }
}

export function buildToolExecutionFailureResult(
  toolCall: ToolCallRecord,
  error: unknown,
): ToolExecutionResult {
  if (isAbortError(error)) {
    throw error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const payload: Record<string, unknown> = {
    ok: false,
    error: message,
    hint: buildToolRecoveryHint(toolCall.function.name, message),
  };

  if (error instanceof ToolExecutionError) {
    payload.code = error.code;
    if (error.details) {
      payload.details = error.details;
    }
  }

  return {
    ok: false,
    output: JSON.stringify(payload, null, 2),
  };
}

function buildToolRecoveryHint(toolName: string, message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("enoent") || lower.includes("no such file") || lower.includes("file not found")) {
    return `The path used by ${toolName} does not exist. Use bash to locate the path, then read the target area.`;
  }

  if (lower.includes("unsupported binary") || lower.includes("binary file detected")) {
    return "The target is not readable text. Available evidence is limited to metadata, filenames, specialized readers, or other text files.";
  }

  if (lower.includes("unknown tool")) {
    return `The ${toolName} tool is unavailable in the current mode. The exposed tool list is the active capability boundary.`;
  }

  if (lower.includes("invalid tool arguments")) {
    return `The arguments for ${toolName} were malformed. The tool schema is the argument contract.`;
  }

  if (toolName === "edit") {
    return "Read the target area, then retry edit with current oldText/newText and a line hint when useful.";
  }

  return `The ${toolName} tool failed. Use the error facts to choose the next tool call.`;
}

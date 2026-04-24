import type { ChangeStore } from "../../changes/store.js";
import { ToolExecutionError } from "../../tools/errors.js";
import { readToolExecutionProtocol } from "../../tools/toolFinalize.js";
import { buildToolRoutingHint, getToolRouteHintForPath, getToolRouteHintForText } from "../../tools/routing.js";
import { createToolRegistry } from "../../tools/index.js";
import type { ProjectContext, ToolCallRecord, ToolExecutionResult } from "../../types.js";
import type { RunTurnOptions } from "../types.js";
import { isAbortError } from "../../utils/abort.js";

export async function executeToolCallWithRecovery(
  toolRegistry: ReturnType<typeof createToolRegistry>,
  toolCall: ToolCallRecord,
  options: RunTurnOptions,
  projectContext: ProjectContext,
  changeStore: ChangeStore,
): Promise<ToolExecutionResult> {
  try {
    return await toolRegistry.execute(toolCall.function.name, toolCall.function.arguments, {
      config: options.config,
      cwd: options.cwd,
      sessionId: options.session.id,
      identity: options.identity ?? {
        kind: "lead",
        name: "lead",
      },
      callbacks: options.callbacks,
      abortSignal: options.abortSignal,
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
    hint: buildToolRecoveryHint(toolCall.function.name, toolCall.function.arguments, message),
    next_step:
      "Choose exactly one route-changing action now: change the arguments, choose a different tool, or switch route based on the error. Do not continue with explanation-only text.",
  };

  if (error instanceof ToolExecutionError) {
    payload.code = error.code;
    if (error.details) {
      payload.details = error.details;
    }
  }

  const protocol = readToolExecutionProtocol(error);
  if (protocol) {
    payload.protocol = protocol;
  }

  return {
    ok: false,
    output: JSON.stringify(payload, null, 2),
    metadata: protocol ? { protocol } : undefined,
  };
}

export async function executePreparedToolCallWithRecovery(
  toolRegistry: Pick<ReturnType<typeof createToolRegistry>, "runPrepared">,
  preparedCall: Parameters<NonNullable<ReturnType<typeof createToolRegistry>["finalize"]>>[0],
  context: Parameters<ReturnType<typeof createToolRegistry>["execute"]>[2],
  toolCall: ToolCallRecord,
): Promise<ToolExecutionResult> {
  try {
    const result = await toolRegistry.runPrepared?.(preparedCall, context);
    if (!result) {
      throw new Error(`Prepared execution was unavailable for ${toolCall.function.name}.`);
    }
    return result;
  } catch (error) {
    return buildToolExecutionFailureResult(toolCall, error);
  }
}

function buildToolRecoveryHint(toolName: string, rawArgs: string, message: string): string {
  const lower = message.toLowerCase();
  const route = readRouteHint(rawArgs, message);

  if (route) {
    return buildToolRoutingHint(route);
  }

  if (lower.includes("enoent") || lower.includes("no such file") || lower.includes("file not found")) {
    return `The path used by ${toolName} does not exist. Use list_files, find_files, or search_files, inspect suggestions, and retry with the exact path.`;
  }

  if (lower.includes("unsupported binary") || lower.includes("binary file detected")) {
    return `The target is not a readable text file. Skip raw content reading and reason from metadata, filenames, or other text files instead.`;
  }

  if (lower.includes("unknown tool")) {
    return `The ${toolName} tool is unavailable in the current mode. Use the tools exposed now, or switch to agent mode if you need editing or shell access.`;
  }

  if (lower.includes("invalid tool arguments")) {
    return `The arguments for ${toolName} were malformed. Re-read the tool schema and retry with valid JSON arguments.`;
  }

  if (lower.includes("failed to apply patch")) {
    return "The patch did not match the current file contents. Read the file again and generate a smaller, more accurate patch.";
  }

  return `The ${toolName} tool failed. Inspect the error, verify assumptions, and retry using a narrower and safer operation.`;
}

function readRouteHint(rawArgs: string, message: string) {
  try {
    const parsed = JSON.parse(rawArgs) as { path?: unknown };
    const targetPath = typeof parsed.path === "string" ? parsed.path : "";
    return getToolRouteHintForPath(targetPath) ?? getToolRouteHintForText(message);
  } catch {
    return getToolRouteHintForText(message);
  }
}

import type { ChangeStore } from "../../changes/store.js";
import { ToolExecutionError } from "../../capabilities/tools/core/errors.js";
import { readToolExecutionProtocol } from "../../capabilities/tools/core/toolFinalize.js";
import { buildToolRoutingHint, getToolRouteHintForPath, getToolRouteHintForText } from "../../capabilities/tools/core/routing.js";
import { createToolRegistry } from "../../capabilities/tools/index.js";
import { buildObjectiveFrame } from "../../objective/metadata.js";
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
      projectContext,
      currentObjective: session.taskState?.objective
        ? buildObjectiveFrame(session.taskState.objective)
        : undefined,
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
    return `The path used by ${toolName} does not exist. Filesystem discovery evidence is available from list_files, find_files, search_files, and path suggestions.`;
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

  if (lower.includes("failed to apply patch")) {
    return "The patch did not match the current file contents. The current file content is the source of truth for any later edit.";
  }

  return `The ${toolName} tool failed. The error payload is the available runtime evidence.`;
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

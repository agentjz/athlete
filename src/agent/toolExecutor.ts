import type { ChangeStore } from "../changes/store.js";
import { ToolExecutionError } from "../tools/errors.js";
import { createToolRegistry } from "../tools/index.js";
import type { ProjectContext, ToolCallRecord, ToolExecutionResult } from "../types.js";
import type { RunTurnOptions } from "./types.js";
import { isAbortError } from "../utils/abort.js";

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
    if (isAbortError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const payload: Record<string, unknown> = {
      ok: false,
      error: message,
      hint: buildToolRecoveryHint(toolCall.function.name, message),
      next_step:
        "Use the error to retry with a safer path, inspect directory structure first, or skip unreadable files.",
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
}

function buildToolRecoveryHint(toolName: string, message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("enoent") || lower.includes("no such file") || lower.includes("file not found")) {
    return `The path used by ${toolName} does not exist. Use list_files or search_files, inspect suggestions, and retry with the exact path.`;
  }

  if (lower.includes("unsupported binary") || lower.includes("binary file detected")) {
    return `The target is not a readable text file. Skip raw content reading and reason from metadata, filenames, or other text files instead.`;
  }

  if (lower.includes("spreadsheet")) {
    return "The target looks like a spreadsheet. Use read_spreadsheet instead of read_file, then continue from the structured preview.";
  }

  if (lower.includes(".docx") || lower.includes("word .docx")) {
    return "The target is a .docx Word document. Use read_docx to inspect it, or write_docx to create one.";
  }

  if (lower.includes(".pdf") || lower.includes("pdf")) {
    return "The target is a PDF document. Use read_pdf instead of read_file so the MinerU-backed extraction path can produce Markdown output.";
  }

  if (lower.includes("legacy word") || lower.includes("convert_to_docx_first") || lower.includes(".doc files")) {
    return "The target is an old .doc Word file. Ask the user to convert it to .docx first, then use read_docx.";
  }

  if (lower.includes("path not allowed")) {
    return "The target path is outside allowedRoots. Try a path inside the current project or ask the user to widen access.";
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

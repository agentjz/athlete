import type { ToolExecutionResult } from "../../../../types.js";

const DIRECT_FILE_READ_PREFIX = /^\s*(cat|type|more|less|get-content|gc)\b/i;

export function getShellFileReadGuardResult(command: string): ToolExecutionResult | null {
  if (!DIRECT_FILE_READ_PREFIX.test(command)) {
    return null;
  }

  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        error: "Direct shell file reads are blocked in the harness.",
        code: "SHELL_FILE_READ_BLOCKED",
        hint: "Text-file reads have a dedicated read_file capability; PDF, image, spreadsheet, and office documents have specialized document capabilities.",
        requiredTool: "read_file",
      },
      null,
      2,
    ),
  };
}

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
        hint: "Use read_file for text files, or switch to the dedicated document tool when the target is a PDF, image, spreadsheet, or office document.",
        suggestedTool: "read_file",
        next_step: "Read the target through the formal file or document tool path instead of shell content dumping.",
      },
      null,
      2,
    ),
  };
}

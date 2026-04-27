import { fileExists, resolveUserPath } from "../../../../utils/fs.js";
import type { ToolExecutionResult } from "../../../../types.js";
import type { ToolContext } from "../../core/types.js";

export async function getWriteExistingFileGuardResult(
  targetPath: string,
  context: ToolContext,
): Promise<ToolExecutionResult | null> {
  const resolved = resolveUserPath(targetPath, context.cwd);
  if (!(await fileExists(resolved))) {
    return null;
  }

  return {
    ok: false,
    output: JSON.stringify(
      {
        ok: false,
        error: "write_file cannot overwrite an existing file in the formal harness path.",
        code: "WRITE_EXISTING_FILE_BLOCKED",
        hint: "Use read_file first, carry the returned identity, and then use edit_file for existing-file changes.",
        suggestedTool: "edit_file",
        next_step: "Read the current file and retry the change through edit_file instead of overwriting it with write_file.",
      },
      null,
      2,
    ),
  };
}

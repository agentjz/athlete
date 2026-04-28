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
        hint: "Existing-file edits require a fresh read_file identity and the edit_file path.",
        suggestedTool: "edit_file",
      },
      null,
      2,
    ),
  };
}

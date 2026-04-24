import { getWriteExistingFileGuardResult } from "./files/writeExistingFileGuard.js";
import { getShellFileReadGuardResult } from "./shell/shellReadGuard.js";
import type { ToolRegistryEntry, ToolContext } from "./types.js";
import type { ToolExecutionResult } from "../types.js";

export async function runToolGuards(
  entry: Pick<ToolRegistryEntry, "name">,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult | null> {
  if (entry.name === "write_file" && typeof args.path === "string" && args.path.trim().length > 0) {
    return getWriteExistingFileGuardResult(args.path, context);
  }

  if (entry.name === "run_shell" && typeof args.command === "string" && args.command.trim().length > 0) {
    return getShellFileReadGuardResult(args.command);
  }

  return null;
}

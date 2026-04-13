import { handleLocalCommand as handleSharedLocalCommand } from "../interaction/localCommands.js";
import type { LocalCommandContext, LocalCommandResult } from "../interaction/localCommands.js";
import type { ShellOutputPort } from "../interaction/shell.js";
import { isExplicitExitCommand } from "../interaction/localCommands.js";
import { createCliOutputPort } from "../shell/cli/output.js";

export type { LocalCommandContext, LocalCommandResult } from "../interaction/localCommands.js";
export { isExplicitExitCommand } from "../interaction/localCommands.js";

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort = createCliOutputPort(),
): Promise<LocalCommandResult> {
  return handleSharedLocalCommand(input, context, output);
}

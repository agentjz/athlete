import {
  handleLocalCommand as handleSharedLocalCommand,
  type LocalCommandContext,
  type LocalCommandResult,
  isExplicitExitCommand,
} from "../interaction/localCommands.js";
import type { ShellOutputPort } from "../interaction/shell.js";
import { WEIXIN_BLOCKED_LOCAL_COMMAND_TEXT, WEIXIN_HELP_TEXT } from "./helpText.zh.js";

const RESET_COMMANDS = new Set(["reset", "/reset", "重置", "/重置"]);
const HELP_COMMANDS = new Set(["/help", "/帮助"]);

export async function handleWeixinLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return "handled";
  }

  if (HELP_COMMANDS.has(normalized)) {
    output.plain(WEIXIN_HELP_TEXT);
    return "handled";
  }

  if (isExplicitExitCommand(normalized) || RESET_COMMANDS.has(normalized)) {
    output.warn(WEIXIN_BLOCKED_LOCAL_COMMAND_TEXT);
    return "handled";
  }

  return handleSharedLocalCommand(input, context, output);
}

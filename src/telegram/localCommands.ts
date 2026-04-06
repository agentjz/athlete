import {
  handleLocalCommand as handleSharedLocalCommand,
  type LocalCommandContext,
  type LocalCommandResult,
  isExplicitExitCommand,
} from "../interaction/localCommands.js";
import type { ShellOutputPort } from "../interaction/shell.js";
import {
  TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT,
  TELEGRAM_HELP_TEXT,
} from "./helpText.zh.js";

const RESET_COMMANDS = new Set(["reset", "/reset", "重置", "/重置"]);
const HELP_COMMANDS = new Set(["/help", "/帮助"]);

export async function handleTelegramLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return "handled";
  }

  if (HELP_COMMANDS.has(normalized)) {
    output.plain(TELEGRAM_HELP_TEXT);
    return "handled";
  }

  if (isExplicitExitCommand(normalized) || RESET_COMMANDS.has(normalized)) {
    output.warn(TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT);
    return "handled";
  }

  return handleSharedLocalCommand(input, context, output);
}

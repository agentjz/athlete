import { resetProjectRuntime } from "../project/reset.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { ShellOutputPort } from "./shell.js";

export interface LocalCommandContext {
  cwd: string;
  session: SessionRecord;
  config: RuntimeConfig;
}

export type LocalCommandResult = "continue" | "handled" | "quit" | "multiline";

const EXIT_COMMANDS = new Set(["q", "quit", "exit", "/q", "/quit", "/exit"]);
const RESET_COMMANDS = new Set(["reset", "/reset"]);
const HELP_COMMANDS = new Set(["/help"]);
const SESSION_COMMANDS = new Set(["/session"]);
const CONFIG_COMMANDS = new Set(["/config"]);
const MULTILINE_COMMANDS = new Set(["/multi"]);

export function isExplicitExitCommand(input: string): boolean {
  return EXIT_COMMANDS.has(input.trim().toLowerCase());
}

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return "handled";
  }

  if (isExplicitExitCommand(normalized)) {
    return "quit";
  }

  if (RESET_COMMANDS.has(normalized)) {
    await resetProjectRuntime({
      cwd: context.cwd,
      config: context.config,
      currentSessionId: context.session.id,
    });
    output.warn("Project runtime reset. Session closed.");
    return "quit";
  }

  if (HELP_COMMANDS.has(normalized)) {
    output.plain(
      [
        "/help        Show help",
        "/session     Show current session ID",
        "/config      Show current runtime config",
        "/multi       Enter multiline input; use ::end to submit and ::cancel to cancel",
        "/reset       Clear current project runtime state and exit",
        "quit         Exit the session",
        "q            Exit the session",
        "/quit /exit  Exit the session",
        "",
        "Any other input is sent directly to kitty.",
      ].join("\n"),
    );
    return "handled";
  }

  if (MULTILINE_COMMANDS.has(normalized)) {
    return "multiline";
  }

  if (SESSION_COMMANDS.has(normalized)) {
    output.info(`Current session: ${context.session.id}`);
    return "handled";
  }

  if (CONFIG_COMMANDS.has(normalized)) {
    output.info(`model=${context.config.model} baseUrl=${context.config.baseUrl}`);
    return "handled";
  }

  return "continue";
}

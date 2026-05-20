import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { createSessionStore, resolveCliSession, runCliMode } from "./sessionHelpers.js";

export function registerAgentCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    dependencies: CliProgramDependencies;
  },
): void {
  program
    .command("agent")
    .description("Start agent mode: direct execution for maintenance, debugging, quick edits, and clear tasks.")
    .argument("[prompt...]", "Optional one-shot prompt. Without a prompt, opens interactive agent mode.")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
      });
      await runCliMode(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
        incompleteMessage: "Agent one-shot did not complete.",
        onIncomplete: (message) => {
          ui.error(message);
          process.exitCode = 1;
        },
      });
    });
}

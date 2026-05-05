import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { createSessionStore, resolveCliSession, runCliMode } from "./sessionHelpers.js";

export function registerSuperCommand(
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
    .command("super")
    .description("Start super mode with the enabled extension workflow ecology.")
    .argument("[prompt...]", "Optional one-shot prompt. Without a prompt, opens interactive super mode.")
    .option("-r, --resume <sessionId>", "Resume a specific session id in super mode.")
    .action(async (promptParts: string[], commandOptions: { resume?: string }) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
        resume: commandOptions.resume,
      });
      const cwd = commandOptions.resume && !runtime.overrides.cwd ? session.cwd : runtime.cwd;
      await runCliMode(options.dependencies, {
        prompt,
        cwd,
        config: runtime.config,
        session,
        sessionStore,
        mode: "super",
        incompleteMessage: "Super one-shot did not complete.",
        onIncomplete: (message) => {
          ui.error(message);
          process.exitCode = 1;
        },
      });
    });
}

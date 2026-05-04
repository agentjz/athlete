import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { createHostSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { createSessionStore, runOneShot, startInteractive } from "./sessionHelpers.js";

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
      const session = await createHostSession(sessionStore, runtime.cwd);

      if (!prompt) {
        await startInteractive(options.dependencies, {
          cwd: runtime.cwd,
          config: runtime.config,
          session,
          sessionStore,
        });
        return;
      }

      const result = await runOneShot(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
      if (!result.closeout.completed) {
        ui.error(result.closeout.unfinishedReason ?? "Agent one-shot did not complete.");
        process.exitCode = 1;
      }
    });
}

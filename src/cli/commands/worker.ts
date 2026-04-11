import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../../types.js";

export function registerWorkerCommands(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  const workerCommand = program.command("__worker__");

  workerCommand
    .command("background")
    .requiredOption("--job-id <jobId>", "Background job id")
    .action(async (commandOptions: { jobId: string }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { runBackgroundWorker } = await import("../../background/worker.js");
      await runBackgroundWorker({
        rootDir: runtime.cwd,
        jobId: commandOptions.jobId,
      });
    });

  workerCommand
    .command("teammate")
    .requiredOption("--name <name>", "Teammate name")
    .requiredOption("--role <role>", "Teammate role")
    .requiredOption("--prompt <prompt>", "Initial teammate prompt")
    .action(async (commandOptions: { name: string; role: string; prompt: string }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { runTeammateWorker } = await import("../../team/worker.js");
      await runTeammateWorker({
        rootDir: runtime.cwd,
        config: runtime.config,
        name: commandOptions.name,
        role: commandOptions.role,
        prompt: commandOptions.prompt,
      });
    });
}

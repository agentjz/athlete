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
    .command("run")
    .requiredOption("--execution-id <executionId>", "Execution id")
    .action(async (commandOptions: { executionId: string }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { runExecutionWorker } = await import("../../execution/worker.js");
      await runExecutionWorker({
        rootDir: runtime.cwd,
        config: runtime.config,
        executionId: commandOptions.executionId,
      });
    });
}

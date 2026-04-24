import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../configValues.js";

export function registerProjectCommands(
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
  program
    .command("init")
    .description("Create local .deadmouse/.env and .deadmouse/.deadmouseignore files in the current project.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { initializeProjectFiles } = await import("../../config/init.js");
      const result = await initializeProjectFiles(runtime.cwd);

      if (result.created.length > 0) {
        ui.success(`Created ${result.created.length} file(s).`);
        for (const filePath of result.created) {
          writeStdoutLine(filePath);
        }
      }

      if (result.skipped.length > 0) {
        ui.info(`Skipped ${result.skipped.length} existing file(s).`);
        for (const filePath of result.skipped) {
          writeStdoutLine(filePath);
        }
      }
    });

  program
    .command("changes")
    .description("List recorded file changes, or show one change by id.")
    .argument("[changeId]", "Optional change id")
    .option("-n, --limit <count>", "Number of changes to show", (value) => Number.parseInt(value, 10), 20)
    .action(async (changeId: string | undefined, commandOptions: { limit?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { ChangeStore } = await import("../../changes/store.js");
      const changeStore = new ChangeStore(runtime.paths.changesDir);

      if (changeId) {
        const change = await changeStore.load(changeId);
        writeStdoutLine(JSON.stringify(change, null, 2));
        return;
      }

      const changes = await changeStore.list(commandOptions.limit ?? 20);
      if (changes.length === 0) {
        ui.info("No recorded changes yet.");
        return;
      }

      for (const change of changes) {
        writeStdoutLine(
          [
            change.id,
            change.createdAt,
            change.toolName,
            `files=${change.operations.length}`,
            change.undoneAt ? "undone" : "active",
            truncateCliValue(change.summary, 80),
          ].join("  "),
        );
      }
    });

  program
    .command("undo")
    .description("Undo the latest recorded change or a specific change id.")
    .argument("[changeId]", "Optional change id")
    .action(async (changeId: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { ChangeStore } = await import("../../changes/store.js");
      const changeStore = new ChangeStore(runtime.paths.changesDir);
      const result = await changeStore.undo(changeId);

      ui.success(`Undid ${result.record.id}`);
      for (const filePath of result.restoredPaths) {
        writeStdoutLine(filePath);
      }
    });

  program
    .command("diff")
    .description("Show current git diff in this project, or only for one path.")
    .argument("[target]", "Optional file path")
    .action(async (target: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { execa } = await import("execa");
      const result = await execa("git", target ? ["diff", "--", target] : ["diff"], {
        cwd: runtime.cwd,
        all: true,
        reject: false,
      });

      if ((result.exitCode ?? 0) > 1) {
        throw new Error(result.all || "git diff failed.");
      }

      const output = result.all?.trim();
      writeStdoutLine(output ? output : "No diff.");
    });
}

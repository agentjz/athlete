import { Command, InvalidOptionArgumentError } from "commander";

import packageJson from "../../package.json";
import { extractCliOverrides } from "./configValues.js";
import type { CliProgramDependencies } from "./dependencies.js";
import { resolveCliRuntime } from "./runtime.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerWorkerCommands } from "./commands/worker.js";
import { parseAgentMode } from "../config/schema.js";
import { writeStderr, writeStdout, writeStdoutLine } from "../utils/stdio.js";
import { registerTelegramCommands } from "../telegram/cli.js";
import { registerWeixinCommands } from "../weixin/cli.js";

export { type CliProgramDependencies } from "./dependencies.js";

export function buildCliProgram(dependencies: CliProgramDependencies = {}): Command {
  const program = new Command();
  const resolveRuntime = dependencies.resolveRuntime ?? resolveCliRuntime;
  const getCliOverrides = () => extractCliOverrides(program.opts());

  program
    .name("athlete")
    .description("Athlete - a problem-solving agent focused on durable task execution.")
    .version(packageJson.version, "-v, --version", "Print the current Athlete version.")
    .configureOutput({
      writeOut: (text) => {
        writeStdout(text);
      },
      writeErr: (text) => {
        writeStderr(text);
      },
      outputError: (text, write) => {
        write(text);
      },
    })
    .option("-m, --model <model>", "Override the configured model")
    .option(
      "--mode <mode>",
      "Mode: read-only | agent",
      (value: string) => {
        const parsed = parseAgentMode(value);
        if (!parsed) {
          throw new InvalidOptionArgumentError(`Invalid mode: ${value}`);
        }

        return parsed;
      },
    )
    .option("-C, --cwd <path>", "Working directory for this run");

  program
    .command("version")
    .description("Print the current Athlete version.")
    .action(() => {
      writeStdoutLine(packageJson.version);
    });

  registerSessionCommands(program, {
    getCliOverrides,
    resolveRuntime,
    dependencies,
  });
  registerProjectCommands(program, {
    getCliOverrides,
    resolveRuntime,
  });
  registerConfigCommands(program, {
    getCliOverrides,
    resolveRuntime,
  });
  registerDoctorCommand(program, {
    getCliOverrides,
    resolveRuntime,
  });

  registerTelegramCommands(program, {
    getCliOverrides,
    resolveRuntime,
    createTelegramService: dependencies.createTelegramService,
    acquireProcessLock: dependencies.acquireProcessLock,
  });
  registerWeixinCommands(program, {
    getCliOverrides,
    resolveRuntime,
    loginWeixin: dependencies.loginWeixin,
    createWeixinService: dependencies.createWeixinService,
    logoutWeixin: dependencies.logoutWeixin,
    acquireProcessLock: dependencies.acquireWeixinProcessLock,
  });
  registerWorkerCommands(program, {
    getCliOverrides,
    resolveRuntime,
  });

  return program;
}

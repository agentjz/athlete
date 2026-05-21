#!/usr/bin/env node

import path from "node:path";

import packageJson from "../package.json";
import { getErrorMessage } from "./agent/errors.js";
import type { CliProgramDependencies } from "./cli/program.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "./project/statePaths.js";
import { installStdioGuards, writeStderrLine, writeStdoutLine } from "./utils/stdio.js";

function loadCliProgramModule(): typeof import("./cli/program.js") {
  return require("./cli/program.js") as typeof import("./cli/program.js");
}

export function buildCliProgram(dependencies: CliProgramDependencies = {}) {
  return loadCliProgramModule().buildCliProgram(dependencies);
}

export async function runCli(
  argv: string[] = process.argv,
  dependencies: CliProgramDependencies = {},
): Promise<void> {
  installStdioGuards();
  const program = buildCliProgram(dependencies);
  await program.parseAsync(argv);
}

function maybeHandleEntryFastPath(argv: string[]): boolean {
  const userArgs = argv.slice(2);
  if (userArgs.length === 1 && (userArgs[0] === "--version" || userArgs[0] === "-v" || userArgs[0] === "version")) {
    writeStdoutLine(packageJson.version);
    return true;
  }

  if (userArgs.length === 2 && userArgs[0] === "config" && userArgs[1] === "path") {
    writeStdoutLine(path.join(process.cwd(), PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME));
    return true;
  }

  return false;
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  if (!maybeHandleEntryFastPath(process.argv)) {
    void runCli().catch((error: unknown) => {
      writeStderrLine(getErrorMessage(error));
      process.exitCode = 1;
    });
  }
}

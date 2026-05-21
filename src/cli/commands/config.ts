import path from "node:path";
import type { Command } from "commander";

import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "../../project/statePaths.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerConfigCommands(
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
  const configCommand = program.command("config").description("Show Kitty runtime configuration from .kitty/.env.");

  configCommand
    .command("show")
    .description("Show resolved runtime configuration and secret status.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      writeStdoutLine(JSON.stringify(toDisplayConfig(runtime.config), null, 2));
    });

  configCommand
    .command("path")
    .description("Show the project .kitty/.env path.")
    .action(() => {
      const overrides = options.getCliOverrides();
      const cwd = path.resolve(overrides.cwd ?? process.cwd());
      writeStdoutLine(path.join(cwd, PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME));
    });
}

function toDisplayConfig(config: RuntimeConfig): Record<string, unknown> {
  return {
    schemaVersion: config.schemaVersion,
    provider: config.provider,
    model: config.model,
    profile: config.profile,
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
    maxOutputTokens: config.maxOutputTokens,
    baseUrl: config.baseUrl,
    runtimeBudget: {
      contextWindowMessages: config.contextWindowMessages,
      maxContextChars: config.maxContextChars,
      contextSummaryChars: config.contextSummaryChars,
      maxReadBytes: config.maxReadBytes,
      projectDocMaxBytes: config.projectDocMaxBytes,
      commandStallTimeoutMs: config.commandStallTimeoutMs,
    },
    showReasoning: config.showReasoning,
    pathAccess: "unrestricted",
    apiKey: config.apiKey ? "set" : "missing",
    telegram: {
      ...config.telegram,
      token: config.telegram.token ? "set" : "missing",
      stateDir: config.telegram.stateDir,
    },
    extensions: config.extensions,
    envFile: path.join(config.paths.configDir, PROJECT_STATE_ENV_FILE_NAME),
    sessionsDir: config.paths.sessionsDir,
    changesDir: config.paths.changesDir,
  };
}

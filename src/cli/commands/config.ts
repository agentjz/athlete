import type { Command } from "commander";

import { getAppPaths } from "../../config/paths.js";
import type { CliOverrides, RuntimeConfig, AppConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import {
  coerceConfigValue,
  isKnownConfigKey,
  isMutableConfigKey,
} from "../configValues.js";

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
  const configCommand = program.command("config").description("Read or update Deadmouse config.");

  configCommand
    .command("show")
    .description("Show config file values and API key status.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      writeStdoutLine(
        JSON.stringify(
          {
            schemaVersion: runtime.config.schemaVersion,
            provider: runtime.config.provider,
            model: runtime.config.model,
            thinking: runtime.config.thinking,
            mode: runtime.config.mode,
            baseUrl: runtime.config.baseUrl,
            pathAccess: "unrestricted",
            apiKey: runtime.config.apiKey ? "set" : "missing",
            agentModels: {
              lead: redactAgentModel(runtime.config.agentModels.lead),
              teammate: redactAgentModel(runtime.config.agentModels.teammate),
              subagent: redactAgentModel(runtime.config.agentModels.subagent),
            },
            telegram: {
              ...runtime.config.telegram,
              token: runtime.config.telegram.token ? "set" : "missing",
              stateDir: runtime.config.telegram.stateDir,
            },
            configFile: runtime.paths.configFile,
            sessionsDir: runtime.paths.sessionsDir,
            changesDir: runtime.paths.changesDir,
          },
          null,
          2,
        ),
      );
    });

  configCommand
    .command("path")
    .description("Show the config file path.")
    .action(async () => {
      writeStdoutLine(getAppPaths().configFile);
    });

  configCommand
    .command("get")
    .description("Read a config key.")
    .argument("<key>", "Config key")
    .action(async (key: string) => {
      if (!isKnownConfigKey(key)) {
        throw new Error(`Unknown config key: ${key}`);
      }

      const { loadConfig } = await import("../../config/store.js");
      const config = await loadConfig();
      writeStdoutLine(JSON.stringify(config[key], null, 2));
    });

  configCommand
    .command("set")
    .description("Set a config key. Arrays can be JSON or comma-separated.")
    .argument("<key>", "Config key")
    .argument("<value>", "Config value")
    .action(async (key: string, value: string) => {
      if (!isKnownConfigKey(key)) {
        throw new Error(`Unknown config key: ${key}`);
      }

      if (!isMutableConfigKey(key)) {
        throw new Error(`${key} is managed by Deadmouse and cannot be changed with config set.`);
      }

      const { updateConfig } = await import("../../config/store.js");
      const next = await updateConfig((config) => {
        return {
          ...config,
          [key]: coerceConfigValue(key, value),
        } as AppConfig;
      });

      ui.success(`Updated ${key}`);
      writeStdoutLine(JSON.stringify(next[key], null, 2));
    });
}

function redactAgentModel(profile: RuntimeConfig["agentModels"]["lead"]): Record<string, unknown> {
  return {
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: profile.apiKey ? "set" : "missing",
    thinking: profile.thinking,
    reasoningEffort: profile.reasoningEffort,
  };
}

#!/usr/bin/env node

import { Command, InvalidOptionArgumentError } from "commander";
import { execa } from "execa";
import OpenAI from "openai";

import { runBackgroundWorker } from "./background/worker.js";
import { getErrorMessage } from "./agent/errors.js";
import { SessionStore } from "./agent/session.js";
import { ChangeStore } from "./changes/store.js";
import {
  coerceConfigValue,
  extractCliOverrides,
  resolveCliRuntime,
  runOneShotPrompt,
  truncateCliValue,
} from "./cli/support.js";
import { initializeProjectFiles } from "./config/init.js";
import { loadConfig, parseAgentMode, updateConfig } from "./config/store.js";
import { runTeammateWorker } from "./team/worker.js";
import {
  createTelegramService as createConfiguredTelegramService,
  registerTelegramCommands,
} from "./telegram/cli.js";
import { acquireTelegramProcessLock } from "./telegram/processLock.js";
import type { AppConfig, RuntimeConfig } from "./types.js";
import { startInteractiveChat } from "./ui/interactive.js";
import { ui } from "./utils/console.js";
import { installStdioGuards, writeStdoutLine } from "./utils/stdio.js";
import {
  createWeixinService as createConfiguredWeixinService,
  loginWeixin as loginConfiguredWeixin,
  logoutWeixin as logoutConfiguredWeixin,
  registerWeixinCommands,
} from "./weixin/cli.js";
import { acquireWeixinProcessLock } from "./weixin/processLock.js";

export interface CliProgramDependencies {
  startInteractive?: typeof startInteractiveChat;
  createTelegramService?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  acquireProcessLock?: typeof acquireTelegramProcessLock;
  loginWeixin?: typeof loginConfiguredWeixin;
  createWeixinService?: (options: {
    cwd: string;
    config: RuntimeConfig;
  }) => Promise<{
    run(signal?: AbortSignal): Promise<void>;
    stop?(): void;
  }>;
  logoutWeixin?: typeof logoutConfiguredWeixin;
  acquireWeixinProcessLock?: typeof acquireWeixinProcessLock;
  resolveRuntime?: typeof resolveCliRuntime;
}

export function buildCliProgram(dependencies: CliProgramDependencies = {}): Command {
  const program = new Command();
  const startInteractive = dependencies.startInteractive ?? startInteractiveChat;
  const createTelegramService = dependencies.createTelegramService ?? createConfiguredTelegramService;
  const createWeixinService = dependencies.createWeixinService ?? createConfiguredWeixinService;
  const resolveRuntimeForCommand = dependencies.resolveRuntime ?? resolveCliRuntime;

  program
    .name("athlete")
    .description("Athlete - a terminal AI coding assistant.")
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
    .option("-C, --cwd <path>", "Working directory for this run")
    .argument("[prompt...]", "Start a new session with a one-shot prompt. Without a prompt, opens interactive chat.")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      const sessionStore = new SessionStore(runtime.paths.sessionsDir);
      const session = await sessionStore.create(runtime.cwd);

      if (!prompt) {
        await startInteractive({
          cwd: runtime.cwd,
          config: runtime.config,
          session,
          sessionStore,
        });
        return;
      }

      const nextSession = await runOneShotPrompt(prompt, runtime.cwd, runtime.config, session, sessionStore);
      ui.dim(`session: ${nextSession.id}`);
    });

  program
    .command("run")
    .description("Run a one-shot prompt in a new session.")
    .argument("<prompt...>", "Prompt to send")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      const sessionStore = new SessionStore(runtime.paths.sessionsDir);
      const session = await sessionStore.create(runtime.cwd);
      const nextSession = await runOneShotPrompt(prompt, runtime.cwd, runtime.config, session, sessionStore);

      ui.dim(`session: ${nextSession.id}`);
    });

  program
    .command("resume")
    .description("Resume the latest session or a specific session id in interactive mode.")
    .argument("[sessionId]", "Session id")
    .action(async (sessionId: string | undefined) => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      const sessionStore = new SessionStore(runtime.paths.sessionsDir);
      const session = sessionId ? await sessionStore.load(sessionId) : await sessionStore.loadLatest();

      if (!session) {
        throw new Error("No saved sessions found.");
      }

      await startInteractive({
        cwd: runtime.overrides.cwd ? runtime.cwd : session.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
    });

  program
    .command("sessions")
    .description("List recent sessions.")
    .option("-n, --limit <count>", "Number of sessions to show", (value) => Number.parseInt(value, 10), 20)
    .action(async (options: { limit?: number }) => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      const sessionStore = new SessionStore(runtime.paths.sessionsDir);
      const sessions = await sessionStore.list(options.limit ?? 20);

      if (sessions.length === 0) {
        ui.info("No saved sessions yet.");
        return;
      }

      for (const session of sessions) {
        writeStdoutLine(
          [
            session.id,
            session.updatedAt,
            session.title ?? "(untitled)",
            `messages=${session.messageCount}`,
          ].join("  "),
        );
      }
    });

  program
    .command("init")
    .description("Create local .athlete/.env and .athlete/.athleteignore files in the current project.")
    .action(async () => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
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
    .action(async (changeId: string | undefined, options: { limit?: number }) => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      const changeStore = new ChangeStore(runtime.paths.changesDir);

      if (changeId) {
        const change = await changeStore.load(changeId);
        writeStdoutLine(JSON.stringify(change, null, 2));
        return;
      }

      const changes = await changeStore.list(options.limit ?? 20);
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
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
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
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
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

  const configCommand = program.command("config").description("Read or update Athlete config.");

  configCommand
    .command("show")
    .description("Show config file values and API key status.")
    .action(async () => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      writeStdoutLine(
        JSON.stringify(
          {
            ...runtime.config,
            apiKey: runtime.config.apiKey ? "set" : "missing",
            telegram: {
              ...runtime.config.telegram,
              token: runtime.config.telegram.token ? "set" : "missing",
              stateDir: runtime.config.telegram.stateDir,
            },
            weixin: {
              ...runtime.config.weixin,
              credentials: runtime.config.weixin.credentials ? "set" : "missing",
              stateDir: runtime.config.weixin.stateDir,
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
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      writeStdoutLine(runtime.paths.configFile);
    });

  configCommand
    .command("get")
    .description("Read a config key.")
    .argument("<key>", "Config key")
    .action(async (key: string) => {
      const config = await loadConfig();
      if (!(key in config)) {
        throw new Error(`Unknown config key: ${key}`);
      }

      const typedKey = key as keyof AppConfig;
      writeStdoutLine(JSON.stringify(config[typedKey], null, 2));
    });

  configCommand
    .command("set")
    .description("Set a config key. Arrays can be JSON or comma-separated.")
    .argument("<key>", "Config key")
    .argument("<value>", "Config value")
    .action(async (key: string, value: string) => {
      const next = await updateConfig((config) => {
        if (!(key in config)) {
          throw new Error(`Unknown config key: ${key}`);
        }

        const typedKey = key as keyof AppConfig;
        return {
          ...config,
          [typedKey]: coerceConfigValue(typedKey, value),
        } as AppConfig;
      });

      ui.success(`Updated ${key}`);
      writeStdoutLine(JSON.stringify(next[key as keyof AppConfig], null, 2));
    });

  program
    .command("doctor")
    .description("Check local setup and validate the API connection.")
    .action(async () => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));

      ui.info(`config: ${runtime.paths.configFile}`);
      ui.info(`sessions: ${runtime.paths.sessionsDir}`);
      ui.info(`model: ${runtime.config.model}`);
      ui.info(`baseUrl: ${runtime.config.baseUrl}`);
      ui.info(`mode: ${runtime.config.mode}`);

      if (!runtime.config.apiKey) {
        ui.warn("No API key found. Update the .env file first.");
        return;
      }

      const client = new OpenAI({
        apiKey: runtime.config.apiKey,
        baseURL: runtime.config.baseUrl,
      });

      const models = await client.models.list();
      const count = Array.isArray(models.data) ? models.data.length : 0;
      ui.success(`API reachable. models=${count}`);
    });

  registerTelegramCommands(program, {
    getCliOverrides: () => extractCliOverrides(program.opts()),
    resolveRuntime: resolveRuntimeForCommand,
    createTelegramService,
    acquireProcessLock: dependencies.acquireProcessLock ?? acquireTelegramProcessLock,
  });
  registerWeixinCommands(program, {
    getCliOverrides: () => extractCliOverrides(program.opts()),
    resolveRuntime: resolveRuntimeForCommand,
    loginWeixin: dependencies.loginWeixin ?? loginConfiguredWeixin,
    createWeixinService,
    logoutWeixin: dependencies.logoutWeixin ?? logoutConfiguredWeixin,
    acquireProcessLock: dependencies.acquireWeixinProcessLock ?? acquireWeixinProcessLock,
  });

  const workerCommand = program.command("__worker__");

  workerCommand
    .command("background")
    .requiredOption("--job-id <jobId>", "Background job id")
    .action(async (options: { jobId: string }) => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      await runBackgroundWorker({
        rootDir: runtime.cwd,
        jobId: options.jobId,
      });
    });

  workerCommand
    .command("teammate")
    .requiredOption("--name <name>", "Teammate name")
    .requiredOption("--role <role>", "Teammate role")
    .requiredOption("--prompt <prompt>", "Initial teammate prompt")
    .action(async (options: { name: string; role: string; prompt: string }) => {
      const runtime = await resolveRuntimeForCommand(extractCliOverrides(program.opts()));
      await runTeammateWorker({
        rootDir: runtime.cwd,
        config: runtime.config,
        name: options.name,
        role: options.role,
        prompt: options.prompt,
      });
    });

  return program;
}

export async function runCli(
  argv: string[] = process.argv,
  dependencies: CliProgramDependencies = {},
): Promise<void> {
  installStdioGuards();
  const program = buildCliProgram(dependencies);
  await program.parseAsync(argv);
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  void runCli().catch((error: unknown) => {
    ui.error(getErrorMessage(error));
    process.exitCode = 1;
  });
}

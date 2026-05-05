import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { loadLatestSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig, SessionRecord } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { ui } from "../../utils/console.js";
import { createSessionStore, resolveCliSession, runCliMode } from "./sessionHelpers.js";

export function registerSessionCommands(
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
    .argument("[prompt...]", "Start a new session with a one-shot prompt. Without a prompt, opens interactive chat.")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
      });
      const result = await runCliMode(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
        mode: "agent",
      });
      if (result) {
        writeStdoutLine(JSON.stringify(result.closeout));
      }
    });

  program
    .command("run")
    .description("Run a one-shot prompt in a new session.")
    .argument("<prompt...>", "Prompt to send")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
      });
      const result = await runCliMode(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
        mode: "agent",
      });
      if (result) {
        writeStdoutLine(JSON.stringify(result.closeout));
      }
    });

  program
    .command("resume")
    .description("Resume the latest session or a specific session id in interactive mode.")
    .argument("[sessionId]", "Session id")
    .action(async (sessionId: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = sessionId ? await sessionStore.load(sessionId) : await loadLatestSession(sessionStore);

      if (!session) {
        throw new Error("No saved sessions found.");
      }

      await runCliMode(options.dependencies, {
        prompt: "",
        cwd: runtime.overrides.cwd ? runtime.cwd : session.cwd,
        config: runtime.config,
        session,
        sessionStore,
        mode: "agent",
      });
    });

  program
    .command("sessions")
    .description("List recent sessions.")
    .option("-n, --limit <count>", "Number of sessions to show", (value) => Number.parseInt(value, 10), 20)
    .action(async (commandOptions: { limit?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const sessions = await sessionStore.list(commandOptions.limit ?? 20);

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
}

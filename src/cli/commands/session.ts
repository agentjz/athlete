import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { createHostSession, loadLatestSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig, SessionRecord } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { ui } from "../../utils/console.js";

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
      writeStdoutLine(JSON.stringify(result.closeout));
    });

  program
    .command("run")
    .description("Run a one-shot prompt in a new session.")
    .argument("<prompt...>", "Prompt to send")
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await createHostSession(sessionStore, runtime.cwd);
      const result = await runOneShot(options.dependencies, {
        prompt,
        cwd: runtime.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
      writeStdoutLine(JSON.stringify(result.closeout));
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

      await startInteractive(options.dependencies, {
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

async function createSessionStore(sessionsDir: string) {
  const { SessionStore } = await import("../../agent/session.js");
  return new SessionStore(sessionsDir);
}

async function startInteractive(
  dependencies: CliProgramDependencies,
  options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
): Promise<void> {
  if (dependencies.startInteractive) {
    await dependencies.startInteractive(options);
    return;
  }

  const { startInteractiveChat } = await import("../../ui/interactive.js");
  await startInteractiveChat(options);
}

async function runOneShot(
  dependencies: CliProgramDependencies,
  options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
) {
  if (dependencies.runOneShot) {
    return dependencies.runOneShot(options);
  }

  const { runOneShotPrompt } = await import("../oneShot.js");
  return runOneShotPrompt(options.prompt, options.cwd, options.config, options.session, options.sessionStore);
}

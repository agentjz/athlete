import type { CliProgramDependencies } from "../dependencies.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";
import { createHostSession } from "../../host/session.js";

export async function createSessionStore(sessionsDir: string) {
  const { SessionStore } = await import("../../session/index.js");
  return new SessionStore(sessionsDir);
}

export async function startInteractive(
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

  const { startInteractiveChat } = await import("../../shell/cli/interactive.js");
  await startInteractiveChat(options);
}

export async function runOneShot(
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
  return runOneShotPrompt(options.prompt, options.cwd, options.config, options.session, options.sessionStore, {
  });
}

export async function resolveCliSession(input: {
  cwd: string;
  sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  resume?: string;
}): Promise<SessionRecord> {
  if (input.resume) {
    return input.sessionStore.load(input.resume);
  }

  return createHostSession(input.sessionStore, input.cwd);
}

export async function runCliMode(
  dependencies: CliProgramDependencies,
  options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
    incompleteMessage?: string;
    onIncomplete?: (message: string) => void;
  },
) {
  if (!options.prompt) {
    await startInteractive(dependencies, {
      cwd: options.cwd,
      config: options.config,
      session: options.session,
      sessionStore: options.sessionStore,
    });
    return undefined;
  }

  const result = await runOneShot(dependencies, {
    prompt: options.prompt,
    cwd: options.cwd,
    config: options.config,
    session: options.session,
    sessionStore: options.sessionStore,
  });
  if (!result.closeout.completed && options.onIncomplete) {
    options.onIncomplete(result.closeout.unfinishedReason ?? options.incompleteMessage ?? "Run did not complete.");
  }
  return result;
}


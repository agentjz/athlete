import type { SessionStoreLike } from "../agent/session.js";
import { loadProjectContext } from "../context/projectContext.js";
import { InteractiveSessionDriver } from "../interaction/sessionDriver.js";
import type { InteractiveSessionDriverOptions } from "../interaction/sessionDriver.js";
import type { InteractionShell } from "../interaction/shell.js";
import { createTerminalLogWriter, mirrorInteractionShellToTerminalLog } from "../observability/terminalLog.js";
import { writeCliInteractiveIntro } from "../shell/cli/intro.js";
import {
  createCliInteractionShell,
} from "../shell/cli/shell.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

interface InteractiveOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
}

export interface StartInteractiveChatDependencies {
  shell?: InteractionShell;
  createShell?: () => InteractionShell;
  createDriver?: (options: InteractiveSessionDriverOptions) => {
    run(): Promise<SessionRecord>;
  };
  writeIntro?: (options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    shell: InteractionShell;
  }) => void;
}

export async function startInteractiveChat(
  options: InteractiveOptions,
  dependencies: StartInteractiveChatDependencies = {},
): Promise<void> {
  const shell = resolveInteractiveShell(dependencies);
  const projectContext = await loadProjectContext(options.cwd);
  const terminalShell = mirrorInteractionShellToTerminalLog(
    shell,
    createTerminalLogWriter(projectContext.stateRootDir, options.session.id),
  );
  (dependencies.writeIntro ?? ((context) => {
    writeCliInteractiveIntro({
      cwd: context.cwd,
      config: context.config,
      session: context.session,
      output: context.shell.output,
    });
  }))({
    cwd: options.cwd,
    config: options.config,
    session: options.session,
    shell: terminalShell,
  });

  const driver =
    dependencies.createDriver?.({
      ...options,
      shell: terminalShell,
    }) ??
    new InteractiveSessionDriver({
      ...options,
      shell: terminalShell,
    });

  try {
    await driver.run();
  } finally {
    terminalShell.dispose?.();
  }
}

function resolveInteractiveShell(dependencies: StartInteractiveChatDependencies): InteractionShell {
  if (dependencies.shell) {
    return dependencies.shell;
  }

  const createShell = dependencies.createShell ?? createCliInteractionShell;
  return createShell();
}

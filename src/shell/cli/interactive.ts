import type { SessionStoreLike } from "../../session/index.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { InteractiveSessionDriver } from "../../interaction/sessionDriver.js";
import type { InteractiveSessionDriverOptions } from "../../interaction/sessionDriver.js";
import type { InteractionShell } from "../../interaction/shell.js";
import {
  createTerminalLogWriter,
  mirrorInteractionShellToTerminalLog,
  mirrorProcessOutputToTerminalLog,
} from "../../observability/terminalLog.js";
import { writeCliInteractiveIntro } from "./intro.js";
import {
  createCliInteractionShell,
} from "./shell.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";
import type { KittyProductMode } from "../../extensions/index.js";

interface InteractiveOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  mode?: KittyProductMode;
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
  const terminalLogWriter = createTerminalLogWriter(projectContext.stateRootDir, options.session.id);
  const disposeTerminalOutputMirror = mirrorProcessOutputToTerminalLog(terminalLogWriter);
  const terminalShell = mirrorInteractionShellToTerminalLog(
    shell,
    terminalLogWriter,
  );
  (dependencies.writeIntro ?? ((context) => {
    writeCliInteractiveIntro({
      cwd: context.cwd,
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
    disposeTerminalOutputMirror();
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

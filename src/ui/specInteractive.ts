import type { SessionStoreLike } from "../agent/session.js";
import { loadProjectContext } from "../context/projectContext.js";
import { InteractiveSessionDriver } from "../interaction/sessionDriver.js";
import type { InteractiveSessionDriverOptions } from "../interaction/sessionDriver.js";
import type { InteractionShell } from "../interaction/shell.js";
import {
  createTerminalLogWriter,
  mirrorInteractionShellToTerminalLog,
  mirrorProcessOutputToTerminalLog,
} from "../observability/terminalLog.js";
import { writeCliInteractiveIntro } from "../shell/cli/intro.js";
import { createCliInteractionShell } from "../shell/cli/shell.js";
import { loadSpecRuntime } from "../spec/runtime.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

interface SpecInteractiveOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
}

export interface StartSpecInteractiveDependencies {
  shell?: InteractionShell;
  createShell?: () => InteractionShell;
  createDriver?: (options: InteractiveSessionDriverOptions) => {
    run(): Promise<SessionRecord>;
  };
}

export async function startSpecInteractive(
  options: SpecInteractiveOptions,
  dependencies: StartSpecInteractiveDependencies = {},
): Promise<void> {
  const shell = dependencies.shell ?? (dependencies.createShell ?? createCliInteractionShell)();
  const projectContext = await loadProjectContext(options.cwd);
  const terminalLogWriter = createTerminalLogWriter(projectContext.stateRootDir, options.session.id);
  const disposeTerminalOutputMirror = mirrorProcessOutputToTerminalLog(terminalLogWriter);
  const terminalShell = mirrorInteractionShellToTerminalLog(shell, terminalLogWriter);
  writeCliInteractiveIntro({
    cwd: options.cwd,
    session: options.session,
    output: terminalShell.output,
    mode: "spec",
  });

  const driverOptions: InteractiveSessionDriverOptions = {
    ...options,
    shell: terminalShell,
    turnContextProvider: async (session) => {
      const specRuntime = await loadSpecRuntime({
        cwd: options.cwd,
        sessionId: session.id,
      });
      return {
        cwd: specRuntime.cwd,
        stateRootDir: specRuntime.stateRootDir,
        mode: "spec",
        extraTools: specRuntime.tools,
        runtimePromptState: {
          mode: "spec",
          extraStaticBlocks: [specRuntime.promptBlock],
        },
      };
    },
  };
  const driver = dependencies.createDriver?.(driverOptions) ?? new InteractiveSessionDriver(driverOptions);

  try {
    await driver.run();
  } finally {
    disposeTerminalOutputMirror();
    terminalShell.dispose?.();
  }
}

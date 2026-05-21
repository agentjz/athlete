import type { SessionStoreLike } from "../../session/index.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { InteractiveSessionDriver } from "../../interaction/sessionDriver.js";
import type { InteractionShell } from "../../interaction/shell.js";
import {
  createTerminalLogWriter,
  mirrorInteractionShellToTerminalLog,
  mirrorProcessOutputToTerminalLog,
} from "../../observability/terminalLog.js";
import { loadSpecRuntime } from "../../spec/runtime.js";
import type { RegisteredTool, ToolFilter } from "../../tools/core/types.js";
import { getBuiltinTools } from "../../tools/toolCatalog.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";
import { writeCliInteractiveIntro } from "./intro.js";
import { createCliInteractionShell } from "./shell.js";

interface SpecInteractiveOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
}

export interface StartSpecInteractiveChatDependencies {
  shell?: InteractionShell;
}

export async function startSpecInteractiveChat(
  options: SpecInteractiveOptions,
  dependencies: StartSpecInteractiveChatDependencies = {},
): Promise<void> {
  const shell = dependencies.shell ?? createCliInteractionShell();
  const projectContext = await loadProjectContext(options.cwd, {
    projectDocMaxBytes: options.config.projectDocMaxBytes,
  });
  const terminalLogWriter = createTerminalLogWriter(projectContext.stateRootDir, options.session.id);
  const disposeTerminalOutputMirror = mirrorProcessOutputToTerminalLog(terminalLogWriter);
  const terminalShell = mirrorInteractionShellToTerminalLog(shell, terminalLogWriter);
  const initialRuntime = await loadSpecRuntime({
    cwd: options.cwd,
    sessionId: options.session.id,
    projectDocMaxBytes: options.config.projectDocMaxBytes,
  });

  writeCliInteractiveIntro({
    cwd: options.cwd,
    session: options.session,
    output: terminalShell.output,
    toolsLabel: formatSpecToolsLabel(initialRuntime.builtinToolFilter, initialRuntime.tools),
  });
  terminalShell.output.info("Spec mode: requirements -> design -> tasks -> implement -> validate.");

  const driver = new InteractiveSessionDriver({
    ...options,
    shell: terminalShell,
    turnContextProvider: async (session) => {
      const runtime = await loadSpecRuntime({
        cwd: options.cwd,
        sessionId: session.id,
        projectDocMaxBytes: options.config.projectDocMaxBytes,
      });
      return {
        cwd: runtime.cwd,
        stateRootDir: runtime.stateRootDir,
        builtinToolFilter: runtime.builtinToolFilter,
        extraTools: runtime.tools,
        runtimePromptState: {
          mode: "spec",
          extraStaticBlocks: [runtime.promptBlock],
        },
      };
    },
  });

  try {
    await driver.run();
  } finally {
    disposeTerminalOutputMirror();
    terminalShell.dispose?.();
  }
}

function formatSpecToolsLabel(
  builtinToolFilter: ToolFilter,
  specTools: readonly RegisteredTool[],
): string {
  const builtinNames = getBuiltinTools()
    .filter(builtinToolFilter)
    .map((tool) => tool.definition.function.name);
  const hasSpecTools = specTools.length > 0;
  return hasSpecTools ? `${builtinNames.join(", ")} + spec` : builtinNames.join(", ");
}

import type { SessionStoreLike } from "../agent/session.js";
import { InteractiveSessionDriver } from "../interaction/sessionDriver.js";
import type { InteractiveSessionDriverOptions } from "../interaction/sessionDriver.js";
import type { InteractionShell } from "../interaction/shell.js";
import { writeCliInteractiveIntro } from "../shell/cli/intro.js";
import { createCliInteractionShell } from "../shell/cli/shell.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";

interface InteractiveOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
}

export interface StartInteractiveChatDependencies {
  shell?: InteractionShell;
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
  const shell = dependencies.shell ?? createCliInteractionShell();
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
    shell,
  });

  const driver =
    dependencies.createDriver?.({
      ...options,
      shell,
    }) ??
    new InteractiveSessionDriver({
      ...options,
      shell,
    });

  await driver.run();
}

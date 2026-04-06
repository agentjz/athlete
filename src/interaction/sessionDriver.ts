import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runManagedAgentTurn } from "../agent/managedTurn.js";
import type { ManagedTurnOptions } from "../agent/managedTurn.js";
import type { SessionStoreLike } from "../agent/sessionStore.js";
import type { RunTurnResult } from "../agent/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { isAbortError } from "../utils/abort.js";
import { handleLocalCommand, type LocalCommandResult } from "./localCommands.js";
import type { InteractionShell } from "./shell.js";

export interface InteractiveSessionDriverOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  shell: InteractionShell;
  runTurn?: (options: ManagedTurnOptions) => Promise<RunTurnResult>;
  localCommandHandler?: typeof handleLocalCommand;
}

export class InteractiveSessionDriver {
  private session: SessionRecord;
  private turnInFlight = false;
  private turnAbortController: AbortController | null = null;
  private lastInterruptNoticeAt = 0;

  constructor(private readonly options: InteractiveSessionDriverOptions) {
    this.session = options.session;
  }

  async run(): Promise<SessionRecord> {
    const releaseInterrupt = this.options.shell.input.bindInterrupt(() => {
      this.handleInterrupt();
    });

    try {
      while (true) {
        const prompt = await this.options.shell.input.readInput("> ");
        if (prompt.kind === "closed") {
          this.showInterruptNotice("This session will not exit automatically. Type quit or q to exit.");
          continue;
        }

        const input = prompt.value.trim();
        if (!input) {
          continue;
        }

        const decision = await this.handleInput(input);
        if (decision === "quit") {
          return this.session;
        }
      }
    } finally {
      releaseInterrupt();
    }
  }

  private async handleInput(input: string): Promise<LocalCommandResult> {
    let localCommandResult: LocalCommandResult;
    try {
      localCommandResult = await (this.options.localCommandHandler ?? handleLocalCommand)(
        input,
        {
          cwd: this.options.cwd,
          session: this.session,
          config: this.options.config,
        },
        this.options.shell.output,
      );
    } catch (error) {
      this.options.shell.output.error(getErrorMessage(error));
      return "handled";
    }

    if (localCommandResult === "continue") {
      await this.runTurn(input);
    } else if (localCommandResult === "multiline") {
      await this.handleMultilineInput();
    }

    return localCommandResult;
  }

  private async handleMultilineInput(): Promise<void> {
    this.options.shell.output.info("Entered multiline mode. Use ::end to submit or ::cancel to cancel.\n");
    const multiline = await this.options.shell.input.readMultiline("… ");

    if (multiline.kind === "cancel") {
      this.options.shell.output.warn("Cancelled multiline input.\n");
      return;
    }

    if (multiline.kind === "closed") {
      this.options.shell.output.warn("Multiline input was interrupted.\n");
      return;
    }

    const value = multiline.value.trim();
    if (!value) {
      this.options.shell.output.warn("Multiline input was empty, nothing was sent.\n");
      return;
    }

    await this.runTurn(value);
  }

  private handleInterrupt(): void {
    if (this.turnInFlight && this.turnAbortController && !this.turnAbortController.signal.aborted) {
      this.turnAbortController.abort();
      this.showInterruptNotice("Interrupted the current turn. You can continue typing.");
      return;
    }

    this.showInterruptNotice("This session will not exit automatically. Type quit or q to exit.");
  }

  private showInterruptNotice(message: string): void {
    const now = Date.now();
    if (now - this.lastInterruptNoticeAt < 150) {
      return;
    }

    this.lastInterruptNoticeAt = now;
    this.options.shell.output.interrupt(message);
  }

  private async runTurn(input: string): Promise<void> {
    this.turnInFlight = true;
    const controller = new AbortController();
    this.turnAbortController = controller;
    const turnDisplay = this.options.shell.createTurnDisplay({
      cwd: this.options.cwd,
      config: this.options.config,
      abortSignal: controller.signal,
    });

    try {
      const result = await (this.options.runTurn ?? runManagedAgentTurn)({
        input,
        cwd: this.options.cwd,
        config: this.options.config,
        session: this.session,
        sessionStore: this.options.sessionStore,
        abortSignal: controller.signal,
        callbacks: turnDisplay.callbacks,
        identity: {
          kind: "lead",
          name: "lead",
        },
      });

      this.session = result.session;
      if (result.paused && result.pauseReason) {
        this.options.shell.output.warn(result.pauseReason);
      }
    } catch (error) {
      turnDisplay.flush();

      if (error instanceof AgentTurnError) {
        this.session = error.session;
      }

      if (isAbortError(error)) {
        this.options.shell.output.warn("Turn interrupted. You can keep chatting.");
      } else {
        this.options.shell.output.error(getErrorMessage(error));
        this.options.shell.output.info("The request failed, but the session is still alive. You can keep chatting.");
      }
    } finally {
      turnDisplay.dispose();
      this.turnInFlight = false;
      this.turnAbortController = null;
    }
  }
}

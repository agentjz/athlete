import { getErrorMessage } from "../agent/errors.js";
import type { SessionStoreLike } from "../agent/session.js";
import { runHostTurn } from "../host/turn.js";
import type { HostManagedTurnRunner } from "../host/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { defaultInteractiveExitGuard, type InteractiveExitGuard, type InteractiveExitProcess } from "./exitGuard.js";
import { handleLocalCommand, type LocalCommandResult } from "./localCommands.js";
import type { InteractionShell } from "./shell.js";

export interface InteractiveSessionDriverOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  shell: InteractionShell;
  exitGuard?: InteractiveExitGuard;
  runTurn?: HostManagedTurnRunner;
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
    } else if (localCommandResult === "quit") {
      return this.handleQuitRequest();
    } else if (localCommandResult === "multiline") {
      await this.handleMultilineInput();
    }

    return localCommandResult;
  }

  private async handleQuitRequest(): Promise<LocalCommandResult> {
    const exitGuard = this.options.exitGuard ?? defaultInteractiveExitGuard;

    let runningProcesses: InteractiveExitProcess[];
    try {
      runningProcesses = await exitGuard.collectRunningProcesses(this.options.cwd);
    } catch (error) {
      this.options.shell.output.error(`Failed to inspect running background processes: ${getErrorMessage(error)}`);
      return "handled";
    }

    if (runningProcesses.length === 0) {
      this.options.shell.output.info("Session saved.");
      return "quit";
    }

    this.options.shell.output.warn("Running background processes detected. Exiting now will kill them all.");
    this.options.shell.output.plain(runningProcesses.map((process) => process.summary).join("\n"));

    const confirmation = await this.options.shell.input.readInput(
      "Kill all running background processes and exit? [y/N] ",
    );

    if (confirmation.kind !== "submit" || !isYes(confirmation.value)) {
      this.options.shell.output.info("Exit cancelled. Background processes will keep running.");
      return "handled";
    }

    try {
      const result = await exitGuard.terminateProcesses(runningProcesses);
      if (result.failedPids.length > 0) {
        this.options.shell.output.error(
          `Could not stop all background processes. Still running: ${result.failedPids.join(", ")}. Exit cancelled.`,
        );
        return "handled";
      }

      this.options.shell.output.warn(`Stopped ${result.terminatedPids.length} background process(es).`);
      this.options.shell.output.info("Session saved.");
      return "quit";
    } catch (error) {
      this.options.shell.output.error(`Failed to stop background processes: ${getErrorMessage(error)}`);
      return "handled";
    }
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
      const outcome = await runHostTurn({
        input,
        cwd: this.options.cwd,
        config: this.options.config,
        session: this.session,
        sessionStore: this.options.sessionStore,
        abortSignal: controller.signal,
        callbacks: turnDisplay.callbacks,
      }, {
        runTurn: this.options.runTurn,
      });

      this.session = outcome.session;
      if (outcome.status === "paused" && outcome.pauseReason) {
        this.options.shell.output.warn(outcome.pauseReason);
        return;
      }

      if (outcome.status === "aborted") {
        turnDisplay.flush();
        this.options.shell.output.warn(outcome.errorMessage ?? "Turn interrupted. You can keep chatting.");
        return;
      }

      if (outcome.status === "failed") {
        turnDisplay.flush();
        this.options.shell.output.error(outcome.errorMessage ?? "The request failed.");
        this.options.shell.output.info("The request failed, but the session is still alive. You can keep chatting.");
      }
    } catch (error) {
      turnDisplay.flush();
      this.options.shell.output.error(getErrorMessage(error));
      this.options.shell.output.info("The request failed, but the session is still alive. You can keep chatting.");
    } finally {
      turnDisplay.dispose();
      this.turnInFlight = false;
      this.turnAbortController = null;
    }
  }
}

function isYes(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

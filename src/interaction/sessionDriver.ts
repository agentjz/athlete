import { getErrorMessage } from "../agent/errors.js";
import process from "node:process";
import type { SessionStoreLike } from "../agent/session.js";
import { loadProjectContext } from "../context/projectContext.js";
import { reconcileBackgroundJobs } from "../execution/background.js";
import { reconcileActiveExecutions } from "../execution/reconcile.js";
import { runHostTurn } from "../host/turn.js";
import { reconcileTeamState } from "../team/reconcile.js";
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
  private exitRequested = false;
  private terminationInProgress = false;

  constructor(private readonly options: InteractiveSessionDriverOptions) {
    this.session = options.session;
  }

  async run(): Promise<SessionRecord> {
    await this.reconcileInteractiveRuntime();
    const releaseInterrupt = this.options.shell.input.bindInterrupt(() => {
      this.handleInterrupt();
    });
    const releaseProcessTermination = this.bindProcessTerminationCleanup();

    try {
      while (true) {
        const prompt = await this.options.shell.input.readInput("> ");
        if (prompt.kind === "closed") {
          await this.terminateRunningProcessesForForcedExit("Input closed. Stopping running worker processes before exit.");
          return this.session;
        }

        const input = prompt.value.trim();
        if (!input) {
          continue;
        }

        const decision = await this.handleInput(input);
        if (decision === "quit") {
          return this.session;
        }
        if (this.exitRequested) {
          return this.session;
        }
      }
    } finally {
      releaseProcessTermination();
      releaseInterrupt();
    }
  }

  private async reconcileInteractiveRuntime(): Promise<void> {
    try {
      const projectContext = await loadProjectContext(this.options.cwd);
      const rootDir = projectContext.stateRootDir;
      await reconcileActiveExecutions(rootDir);
      await reconcileTeamState(rootDir);
      await reconcileBackgroundJobs(rootDir);
    } catch (error) {
      this.options.shell.output.warn(`Runtime recovery skipped: ${getErrorMessage(error)}`);
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

    this.options.shell.output.warn("Running worker processes detected. Exiting now will kill them all.");
    this.options.shell.output.plain(runningProcesses.map((process) => process.summary).join("\n"));

    const confirmation = await this.options.shell.input.readInput(
      "Kill all running worker processes and exit? [y/N] ",
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
      await this.terminateRunningProcessesForForcedExit("Input closed during multiline mode. Stopping running worker processes before exit.");
      this.exitRequested = true;
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

  private bindProcessTerminationCleanup(): () => void {
    const signals: NodeJS.Signals[] = ["SIGHUP", "SIGTERM", "SIGBREAK"];
    const handler = (signal: NodeJS.Signals): void => {
      void this.terminateRunningProcessesForForcedExit(
        `Received ${signal}. Stopping running worker processes before exit.`,
      ).finally(() => {
        process.exit(0);
      });
    };

    for (const signal of signals) {
      process.once(signal, handler);
    }

    return () => {
      for (const signal of signals) {
        process.off(signal, handler);
      }
    };
  }

  private async terminateRunningProcessesForForcedExit(reason: string): Promise<void> {
    if (this.terminationInProgress) {
      return;
    }

    this.terminationInProgress = true;
    this.exitRequested = true;
    if (this.turnAbortController && !this.turnAbortController.signal.aborted) {
      this.turnAbortController.abort();
    }

    const exitGuard = this.options.exitGuard ?? defaultInteractiveExitGuard;
    try {
      const runningProcesses = await exitGuard.collectRunningProcesses(this.options.cwd);
      if (runningProcesses.length === 0) {
        this.options.shell.output.info("Session saved.");
        return;
      }

      this.options.shell.output.warn(reason);
      this.options.shell.output.plain(runningProcesses.map((processInfo) => processInfo.summary).join("\n"));
      const result = await exitGuard.terminateProcesses(runningProcesses);
      if (result.failedPids.length > 0) {
        this.options.shell.output.error(`Could not stop all worker processes. Still running: ${result.failedPids.join(", ")}.`);
        return;
      }

      this.options.shell.output.warn(`Stopped ${result.terminatedPids.length} worker process(es).`);
      this.options.shell.output.info("Session saved.");
    } catch (error) {
      this.options.shell.output.error(`Failed to stop worker processes: ${getErrorMessage(error)}`);
    }
  }

  private async runTurn(input: string): Promise<void> {
    this.options.shell.output.plain(formatSubmittedInput(input));
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
        host: "interactive",
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

function formatSubmittedInput(input: string): string {
  return input
    .split("\n")
    .map((line, index) => `${index === 0 ? "> " : "… "}${line}`)
    .join("\n");
}

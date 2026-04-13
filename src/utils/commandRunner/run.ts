import { truncateText } from "../fs.js";
import { launchCommand } from "./launch.js";
import { normalizeCommandForPlatform } from "./platform.js";

export interface CommandRunOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  stallTimeoutMs: number;
  abortSignal?: AbortSignal;
  maxRetries: number;
  retryBackoffMs: number;
  canRetry: boolean;
}

export interface CommandRunResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  stalled: boolean;
  attempts: number;
  durationMs: number;
}

const MAX_OUTPUT_CHARS = 12_000;
const STALL_KILL_TIMEOUT_MS = 5_000;

export async function runCommandWithPolicy(options: CommandRunOptions): Promise<CommandRunResult> {
  const attempts = Math.max(1, Math.trunc(options.maxRetries) + 1);
  let lastResult: CommandRunResult | null = null;
  const normalizedCommand = normalizeCommandForPlatform(options.command);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await runCommandOnce({
      ...options,
      command: normalizedCommand,
    });

    const success = lastResult.exitCode === 0 && !lastResult.timedOut && !lastResult.stalled;
    if (success) {
      return lastResult;
    }

    if (!options.canRetry || attempt >= attempts) {
      return lastResult;
    }

    await sleep(options.retryBackoffMs * attempt, options.abortSignal);
  }

  return lastResult ?? {
    exitCode: null,
    output: "",
    timedOut: false,
    stalled: false,
    attempts: 0,
    durationMs: 0,
  };
}

async function runCommandOnce(options: CommandRunOptions): Promise<CommandRunResult> {
  const start = Date.now();
  let stalled = false;
  let stallTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const subprocess = launchCommand(options.command, options.cwd, options.timeoutMs, options.abortSignal);

  const clearTimers = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const resetStallTimer = () => {
    if (stalled) {
      return;
    }

    if (stallTimer) {
      clearTimeout(stallTimer);
    }

    if (options.stallTimeoutMs > 0) {
      stallTimer = setTimeout(() => {
        stalled = true;
        try {
          subprocess.kill("SIGTERM");
        } catch {
          // ignore
        }
        if (STALL_KILL_TIMEOUT_MS > 0) {
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => {
            try {
              if (typeof subprocess.exitCode !== "number") {
                subprocess.kill("SIGKILL");
              }
            } catch {
              // ignore
            }
          }, STALL_KILL_TIMEOUT_MS);
        }
      }, options.stallTimeoutMs);
    }
  };

  resetStallTimer();

  if (subprocess.all) {
    subprocess.all.on("data", resetStallTimer);
  }

  try {
    const result = await subprocess;
    clearTimers();

    return {
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      output: truncateText(result.all ?? "", MAX_OUTPUT_CHARS),
      timedOut: Boolean((result as { timedOut?: unknown }).timedOut),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    clearTimers();

    return {
      exitCode: readExitCode(error),
      output: truncateText(readProcessOutput(error), MAX_OUTPUT_CHARS),
      timedOut: isTimedOutError(error),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  }
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

function readExitCode(error: unknown): number | null {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : null;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Command failed.";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error("Command retry aborted."));
        },
        { once: true },
      );
    }
  });
}

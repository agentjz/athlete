import { runCommandWithPolicy } from "../utils/commandRunner.js";
import { truncateText } from "../utils/fs.js";
import { closeExecution } from "./closeout.js";
import { ExecutionStore } from "./store.js";
import { recordExecutionStarted } from "./workerObservability.js";
import type { ExecutionRecord } from "./types.js";

export async function runCommandExecution(rootDir: string, execution: ExecutionRecord): Promise<void> {
  const store = new ExecutionStore(rootDir);
  await store.start(execution.id, {
    pid: process.pid,
  });
  await recordExecutionStarted(rootDir, execution);

  try {
    const result = await runCommandWithPolicy({
      command: execution.command || "",
      cwd: execution.cwd,
      timeoutMs: execution.timeoutMs ?? 120_000,
      stallTimeoutMs: execution.stallTimeoutMs ?? execution.timeoutMs ?? 120_000,
      maxRetries: 0,
      retryBackoffMs: 0,
      canRetry: false,
    });
    const status = result.stalled || result.timedOut
      ? "failed"
      : result.exitCode === 0
        ? "completed"
        : "failed";
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status,
      summary: status === "completed" ? "background execution completed" : "background execution failed",
      output: truncateText(result.output ?? "", 12_000),
      exitCode: typeof result.exitCode === "number" ? result.exitCode : undefined,
      statusDetail: result.stalled || result.timedOut ? "timed_out" : undefined,
    });
  } catch (error) {
    await closeExecution({
      rootDir,
      executionId: execution.id,
      status: "failed",
      summary: "background execution failed",
      output: truncateText(readProcessOutput(error), 12_000),
      exitCode: readExitCode(error),
      statusDetail: isTimedOutError(error) ? "timed_out" : undefined,
    }).catch(() => null);
    throw error;
  }
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

function readExitCode(error: unknown): number | undefined {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : undefined;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Background execution failed.";
}

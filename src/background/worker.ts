import { MessageBus } from "../team/messageBus.js";
import { truncateText } from "../utils/fs.js";
import { runCommandWithPolicy } from "../utils/commandRunner.js";
import { BackgroundJobStore } from "./store.js";

export interface BackgroundWorkerOptions {
  rootDir: string;
  jobId: string;
}

export async function runBackgroundWorker(options: BackgroundWorkerOptions): Promise<void> {
  const store = new BackgroundJobStore(options.rootDir);
  const bus = new MessageBus(options.rootDir);
  const job = await store.load(options.jobId);

  try {
    const result = await runCommandWithPolicy({
      command: job.command,
      cwd: job.cwd,
      timeoutMs: job.timeoutMs,
      stallTimeoutMs: job.stallTimeoutMs ?? job.timeoutMs,
      maxRetries: 0,
      retryBackoffMs: 0,
      canRetry: false,
    });
    const status = result.stalled || result.timedOut
      ? "timed_out"
      : result.exitCode === 0
        ? "completed"
        : "failed";

    const completed = await store.complete(job.id, {
      status,
      exitCode: typeof result.exitCode === "number" ? result.exitCode : undefined,
      output: truncateText(result.output ?? "", 12_000),
    });
    await notifyCompletion(bus, completed);
  } catch (error) {
    const completed = await store.complete(job.id, {
      status: isTimedOutError(error) ? "timed_out" : "failed",
      exitCode: readExitCode(error),
      output: truncateText(readProcessOutput(error), 12_000),
    });
    await notifyCompletion(bus, completed);
  }
}

async function notifyCompletion(bus: MessageBus, job: Awaited<ReturnType<BackgroundJobStore["load"]>>): Promise<void> {
  const statusText =
    job.status === "completed"
      ? "completed"
      : job.status === "timed_out"
        ? "timed out"
        : "failed";
  const preview = truncateText(job.output?.trim() || "(no output)", 600);
  await bus.send(
    `bg-${job.id}`,
    job.requestedBy,
    `[bg:${job.id}] ${statusText}: ${job.command}\n${preview}`,
    "background_result",
    {
      jobId: job.id,
      jobStatus: job.status,
      exitCode: job.exitCode,
    },
  );
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
  return typeof message === "string" && message.length > 0 ? message : "Background job failed.";
}

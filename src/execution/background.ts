import process from "node:process";
import path from "node:path";

import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";

export type BackgroundJobStatus = "running" | "completed" | "failed" | "timed_out";

export interface BackgroundJobRecord {
  id: string;
  command: string;
  cwd: string;
  requestedBy: string;
  status: BackgroundJobStatus;
  timeoutMs: number;
  stallTimeoutMs?: number;
  pid?: number;
  exitCode?: number;
  output?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface BackgroundReconcileResult {
  staleJobs: BackgroundJobRecord[];
}

export class BackgroundJobStore {
  constructor(private readonly rootDir: string) {}

  async create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    timeoutMs: number;
    stallTimeoutMs?: number;
  }): Promise<BackgroundJobRecord> {
    const execution = await new ExecutionStore(this.rootDir).create({
      lane: "command",
      profile: "background",
      launch: "worker",
      requestedBy: input.requestedBy,
      actorName: "background",
      cwd: input.cwd,
      command: input.command,
      timeoutMs: input.timeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
    });
    return mapExecutionToBackgroundJob(execution);
  }

  async load(jobId: string): Promise<BackgroundJobRecord> {
    return mapExecutionToBackgroundJob(assertBackgroundExecution(await new ExecutionStore(this.rootDir).load(jobId)));
  }

  async save(job: BackgroundJobRecord): Promise<BackgroundJobRecord> {
    return mapExecutionToBackgroundJob(
      await new ExecutionStore(this.rootDir).save(mapBackgroundJobToExecution(job)),
    );
  }

  async setPid(jobId: string, pid: number): Promise<BackgroundJobRecord> {
    return mapExecutionToBackgroundJob(
      assertBackgroundExecution(
        await new ExecutionStore(this.rootDir).start(jobId, {
          pid,
        }),
      ),
    );
  }

  async complete(
    jobId: string,
    input: {
      status: BackgroundJobStatus;
      exitCode?: number;
      output?: string;
    },
  ): Promise<BackgroundJobRecord> {
    return mapExecutionToBackgroundJob(
      assertBackgroundExecution(
        await new ExecutionStore(this.rootDir).close(jobId, {
          status: input.status === "completed" ? "completed" : "failed",
          summary: input.status === "completed" ? "background execution completed" : "background execution failed",
          output: input.output,
          exitCode: input.exitCode,
          statusDetail: input.status === "timed_out" ? "timed_out" : undefined,
        }),
      ),
    );
  }

  async list(): Promise<BackgroundJobRecord[]> {
    return (await new ExecutionStore(this.rootDir).listRelevant({
      profile: "background",
    })).map((execution) => mapExecutionToBackgroundJob(execution));
  }

  async listRelevant(options: { cwd?: string; requestedBy?: string } = {}): Promise<BackgroundJobRecord[]> {
    const jobs = await this.list();
    return jobs.filter((job) => isRelevantJob(job, options));
  }

  async summarize(options: { cwd?: string; requestedBy?: string } = {}): Promise<string> {
    const jobs = await this.listRelevant(options);
    if (jobs.length === 0) {
      return "No background jobs.";
    }

    return jobs
      .slice(0, 12)
      .map((job) => {
        const marker = job.status === "completed"
          ? "[x]"
          : job.status === "failed"
            ? "[!]"
            : job.status === "timed_out"
              ? "[t]"
              : "[>]";
        const exit = typeof job.exitCode === "number" ? ` exit=${job.exitCode}` : "";
        return `${marker} ${job.id} @${job.requestedBy} ${job.command}${exit}`;
      })
      .join("\n");
  }
}

export async function reconcileBackgroundJobs(rootDir: string): Promise<BackgroundReconcileResult> {
  const store = new BackgroundJobStore(rootDir);
  const jobs = await store.list();
  const staleJobs: BackgroundJobRecord[] = [];

  for (const job of jobs) {
    if (job.status !== "running" || typeof job.pid !== "number") {
      continue;
    }

    if (isProcessAlive(job.pid)) {
      continue;
    }

    staleJobs.push(
      await store.complete(job.id, {
        status: "failed",
        exitCode: job.exitCode,
        output: job.output ?? "Background worker exited unexpectedly before reporting completion.",
      }),
    );
  }

  return {
    staleJobs,
  };
}

function mapExecutionToBackgroundJob(execution: ExecutionRecord): BackgroundJobRecord {
  return {
    id: execution.id,
    command: execution.command || "",
    cwd: execution.cwd,
    requestedBy: execution.requestedBy,
    status: readBackgroundJobStatus(execution),
    timeoutMs: execution.timeoutMs ?? 120_000,
    stallTimeoutMs: execution.stallTimeoutMs ?? execution.timeoutMs ?? 120_000,
    pid: execution.pid,
    exitCode: execution.exitCode,
    output: execution.output,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    finishedAt: execution.finishedAt,
  };
}

function mapBackgroundJobToExecution(job: BackgroundJobRecord): ExecutionRecord {
  return {
    id: job.id,
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: job.requestedBy,
    actorName: "background",
    cwd: job.cwd,
    status: job.status === "running" ? "running" : job.status === "completed" ? "completed" : "failed",
    worktreePolicy: "none",
    command: job.command,
    timeoutMs: job.timeoutMs,
    stallTimeoutMs: job.stallTimeoutMs,
    pid: job.pid,
    output: job.output,
    exitCode: job.exitCode,
    statusDetail: job.status === "timed_out" ? "timed_out" : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

function readBackgroundJobStatus(execution: ExecutionRecord): BackgroundJobStatus {
  if (execution.status === "completed") {
    return "completed";
  }

  if (execution.statusDetail === "timed_out") {
    return "timed_out";
  }

  if (execution.status === "queued" || execution.status === "running") {
    return "running";
  }

  return "failed";
}

function assertBackgroundExecution(execution: ExecutionRecord): ExecutionRecord {
  if (execution.profile !== "background") {
    throw new Error(`Execution ${execution.id} is '${execution.profile}', not 'background'.`);
  }

  return execution;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRelevantJob(
  job: BackgroundJobRecord,
  options: {
    cwd?: string;
    requestedBy?: string;
  },
): boolean {
  if (options.requestedBy && job.requestedBy !== options.requestedBy) {
    return false;
  }

  if (!options.cwd) {
    return true;
  }

  const scope = path.resolve(options.cwd);
  const jobCwd = path.resolve(job.cwd);
  return isSameOrDescendant(scope, jobCwd) || isSameOrDescendant(jobCwd, scope);
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

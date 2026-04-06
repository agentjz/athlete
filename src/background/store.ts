import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import type { BackgroundJobRecord, BackgroundJobStatus } from "./types.js";

export class BackgroundJobStore {
  constructor(private readonly rootDir: string) {}

  async create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    timeoutMs: number;
    stallTimeoutMs?: number;
  }): Promise<BackgroundJobRecord> {
    const now = new Date().toISOString();
    const job = normalizeJob({
      id: createJobId(),
      command: input.command,
      cwd: input.cwd,
      requestedBy: input.requestedBy,
      status: "running",
      timeoutMs: input.timeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
      createdAt: now,
      updatedAt: now,
    });
    await this.save(job);
    return job;
  }

  async load(jobId: string): Promise<BackgroundJobRecord> {
    const filePath = this.getJobPath(jobId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return normalizeJob(JSON.parse(raw) as BackgroundJobRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Background job ${jobId} not found.`);
      }
      throw error;
    }
  }

  async save(job: BackgroundJobRecord): Promise<BackgroundJobRecord> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const normalized = normalizeJob(job);
    await fs.writeFile(path.join(paths.backgroundDir, `job_${normalized.id}.json`), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  async setPid(jobId: string, pid: number): Promise<BackgroundJobRecord> {
    const job = await this.load(jobId);
    return this.save({
      ...job,
      pid: Number.isFinite(pid) ? Math.trunc(pid) : undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  async complete(
    jobId: string,
    input: {
      status: BackgroundJobStatus;
      exitCode?: number;
      output?: string;
    },
  ): Promise<BackgroundJobRecord> {
    const job = await this.load(jobId);
    const now = new Date().toISOString();
    return this.save({
      ...job,
      status: input.status,
      exitCode: typeof input.exitCode === "number" && Number.isFinite(input.exitCode) ? Math.trunc(input.exitCode) : undefined,
      output: typeof input.output === "string" ? input.output : job.output,
      updatedAt: now,
      finishedAt: now,
    });
  }

  async list(): Promise<BackgroundJobRecord[]> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const entries = await fs.readdir(paths.backgroundDir, { withFileTypes: true });
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^job_[a-z0-9]+\.json$/i.test(entry.name))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(paths.backgroundDir, entry.name), "utf8");
          return normalizeJob(JSON.parse(raw) as BackgroundJobRecord);
        }),
    );
    return jobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listRelevant(options: {
    cwd?: string;
    requestedBy?: string;
  } = {}): Promise<BackgroundJobRecord[]> {
    const jobs = await this.list();
    return jobs.filter((job) => isRelevantJob(job, options));
  }

  async summarize(options: {
    cwd?: string;
    requestedBy?: string;
  } = {}): Promise<string> {
    const jobs = await this.listRelevant(options);
    if (jobs.length === 0) {
      return "No background jobs.";
    }

    return jobs
      .slice(0, 12)
      .map((job) => {
        const marker = formatMarker(job.status);
        const exit = typeof job.exitCode === "number" ? ` exit=${job.exitCode}` : "";
        return `${marker} ${job.id} @${job.requestedBy} ${job.command}${exit}`;
      })
      .join("\n");
  }

  private getJobPath(jobId: string): string {
    return path.join(getProjectStatePaths(this.rootDir).backgroundDir, `job_${normalizeId(jobId)}.json`);
  }
}

function isRelevantJob(
  job: BackgroundJobRecord,
  options: {
    cwd?: string;
    requestedBy?: string;
  },
): boolean {
  if (options.requestedBy && normalizeText(job.requestedBy) !== normalizeText(options.requestedBy)) {
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

function normalizeJob(job: BackgroundJobRecord): BackgroundJobRecord {
  const now = new Date().toISOString();
  return {
    id: normalizeId(job.id) || createJobId(),
    command: normalizeText(job.command),
    cwd: normalizeText(job.cwd),
    requestedBy: normalizeText(job.requestedBy) || "lead",
    status: normalizeStatus(job.status),
    timeoutMs: normalizeTimeout(job.timeoutMs),
    stallTimeoutMs: normalizeTimeout(job.stallTimeoutMs ?? job.timeoutMs),
    pid: typeof job.pid === "number" && Number.isFinite(job.pid) ? Math.trunc(job.pid) : undefined,
    exitCode: typeof job.exitCode === "number" && Number.isFinite(job.exitCode) ? Math.trunc(job.exitCode) : undefined,
    output: typeof job.output === "string" && job.output.length > 0 ? job.output : undefined,
    createdAt: typeof job.createdAt === "string" && job.createdAt ? job.createdAt : now,
    updatedAt: typeof job.updatedAt === "string" && job.updatedAt ? job.updatedAt : now,
    finishedAt: typeof job.finishedAt === "string" && job.finishedAt ? job.finishedAt : undefined,
  };
}

function normalizeStatus(value: string): BackgroundJobStatus {
  switch (value) {
    case "completed":
    case "failed":
    case "timed_out":
      return value;
    default:
      return "running";
  }
}

function normalizeTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 120_000;
  }

  return Math.max(1_000, Math.min(600_000, Math.trunc(value)));
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function createJobId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function formatMarker(status: BackgroundJobStatus): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "failed":
      return "[!]";
    case "timed_out":
      return "[t]";
    default:
      return "[>]";
  }
}

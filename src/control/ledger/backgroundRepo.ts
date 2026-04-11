import crypto from "node:crypto";
import path from "node:path";

import type Database from "better-sqlite3";

import type { BackgroundJobRecord, BackgroundJobStatus } from "../../background/types.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export class BackgroundJobLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    timeoutMs: number;
    stallTimeoutMs?: number;
  }): BackgroundJobRecord {
    const now = currentTimestamp();
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
    this.db.prepare(`
      INSERT INTO background_jobs (
        id,
        command,
        cwd,
        requested_by,
        status,
        timeout_ms,
        stall_timeout_ms,
        pid,
        exit_code,
        output,
        created_at,
        updated_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.command,
      job.cwd,
      job.requestedBy,
      job.status,
      job.timeoutMs,
      job.stallTimeoutMs ?? job.timeoutMs,
      null,
      null,
      null,
      job.createdAt,
      job.updatedAt,
      null,
    );
    return this.load(job.id);
  }

  load(jobId: string): BackgroundJobRecord {
    const row = this.db.prepare(`
      SELECT
        id,
        command,
        cwd,
        requested_by,
        status,
        timeout_ms,
        stall_timeout_ms,
        pid,
        exit_code,
        output,
        created_at,
        updated_at,
        finished_at
      FROM background_jobs
      WHERE id = ?
    `).get(normalizeId(jobId)) as BackgroundJobRow | undefined;
    if (!row) {
      throw new Error(`Background job ${jobId} not found.`);
    }
    return mapBackgroundJobRow(row);
  }

  save(job: BackgroundJobRecord): BackgroundJobRecord {
    const normalized = normalizeJob(job);
    this.db.prepare(`
      INSERT INTO background_jobs (
        id,
        command,
        cwd,
        requested_by,
        status,
        timeout_ms,
        stall_timeout_ms,
        pid,
        exit_code,
        output,
        created_at,
        updated_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        command = excluded.command,
        cwd = excluded.cwd,
        requested_by = excluded.requested_by,
        status = excluded.status,
        timeout_ms = excluded.timeout_ms,
        stall_timeout_ms = excluded.stall_timeout_ms,
        pid = excluded.pid,
        exit_code = excluded.exit_code,
        output = excluded.output,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        finished_at = excluded.finished_at
    `).run(
      normalized.id,
      normalized.command,
      normalized.cwd,
      normalized.requestedBy,
      normalized.status,
      normalized.timeoutMs,
      normalized.stallTimeoutMs ?? normalized.timeoutMs,
      normalized.pid ?? null,
      normalized.exitCode ?? null,
      normalized.output ?? null,
      normalized.createdAt,
      normalized.updatedAt,
      normalized.finishedAt ?? null,
    );
    return this.load(normalized.id);
  }

  setPid(jobId: string, pid: number): BackgroundJobRecord {
    const job = this.load(jobId);
    return this.save({
      ...job,
      pid: Number.isFinite(pid) ? Math.trunc(pid) : undefined,
      updatedAt: currentTimestamp(),
    });
  }

  complete(
    jobId: string,
    input: {
      status: BackgroundJobStatus;
      exitCode?: number;
      output?: string;
    },
  ): BackgroundJobRecord {
    const job = this.load(jobId);
    const now = currentTimestamp();
    return this.save({
      ...job,
      status: input.status,
      exitCode: typeof input.exitCode === "number" && Number.isFinite(input.exitCode) ? Math.trunc(input.exitCode) : undefined,
      output: typeof input.output === "string" ? input.output : job.output,
      updatedAt: now,
      finishedAt: now,
    });
  }

  list(): BackgroundJobRecord[] {
    const rows = this.db.prepare(`
      SELECT
        id,
        command,
        cwd,
        requested_by,
        status,
        timeout_ms,
        stall_timeout_ms,
        pid,
        exit_code,
        output,
        created_at,
        updated_at,
        finished_at
      FROM background_jobs
      ORDER BY created_at DESC
    `).all() as BackgroundJobRow[];
    return rows.map((row) => mapBackgroundJobRow(row));
  }

  listRelevant(options: { cwd?: string; requestedBy?: string } = {}): BackgroundJobRecord[] {
    return this.list().filter((job) => isRelevantJob(job, options));
  }
}

interface BackgroundJobRow {
  id: string;
  command: string;
  cwd: string;
  requested_by: string;
  status: string;
  timeout_ms: number;
  stall_timeout_ms: number | null;
  pid: number | null;
  exit_code: number | null;
  output: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

function mapBackgroundJobRow(row: BackgroundJobRow): BackgroundJobRecord {
  return normalizeJob({
    id: row.id,
    command: row.command,
    cwd: row.cwd,
    requestedBy: row.requested_by,
    status: row.status as BackgroundJobStatus,
    timeoutMs: row.timeout_ms,
    stallTimeoutMs: row.stall_timeout_ms ?? row.timeout_ms,
    pid: row.pid ?? undefined,
    exitCode: row.exit_code ?? undefined,
    output: row.output ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  });
}

function normalizeJob(job: BackgroundJobRecord): BackgroundJobRecord {
  const now = currentTimestamp();
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

function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function createJobId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
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

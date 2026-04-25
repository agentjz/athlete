import crypto from "node:crypto";

import type Database from "better-sqlite3";

import type {
  ExecutionCloseInput,
  ExecutionLaunchMode,
  ExecutionLane,
  ExecutionProfile,
  ExecutionRecord,
  ExecutionStatus,
  ExecutionWorktreePolicy,
} from "../../execution/types.js";
import { resolveExecutionBoundary } from "../../execution/boundary.js";
import { applyExecutionClose, applyExecutionStart, assertExecutionSaveAllowed } from "./executionLifecycle.js";
import { currentTimestamp, normalizeText } from "./shared.js";

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    lane: ExecutionLane;
    profile: ExecutionProfile;
    launch: ExecutionLaunchMode;
    requestedBy: string;
    actorName: string;
    actorRole?: string;
    taskId?: number;
    cwd: string;
    worktreePolicy?: ExecutionWorktreePolicy;
    prompt?: string;
    command?: string;
    timeoutMs?: number;
    stallTimeoutMs?: number;
  }): ExecutionRecord {
    const now = currentTimestamp();
    const record = normalizeExecution({
      id: normalizeExecutionId(input.id) || createExecutionId(),
      lane: input.lane,
      profile: input.profile,
      launch: input.launch,
      requestedBy: input.requestedBy,
      actorName: input.actorName,
      actorRole: input.actorRole,
      taskId: input.taskId,
      cwd: input.cwd,
      status: "queued",
      worktreePolicy: input.worktreePolicy ?? "none",
      prompt: input.prompt,
      command: input.command,
      timeoutMs: input.timeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
      createdAt: now,
      updatedAt: now,
    });

    this.db.prepare(`
      INSERT INTO executions (
        id,
        lane,
        profile,
        launch_mode,
        requested_by,
        actor_name,
        actor_role,
        task_id,
        cwd,
        status,
        worktree_policy,
        worktree_name,
        session_id,
        pid,
        prompt,
        command,
        timeout_ms,
        stall_timeout_ms,
        summary,
        result_text,
        output,
        exit_code,
        pause_reason,
        status_detail,
        created_at,
        updated_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.lane,
      record.profile,
      record.launch,
      record.requestedBy,
      record.actorName,
      record.actorRole ?? null,
      record.taskId ?? null,
      record.cwd,
      record.status,
      record.worktreePolicy,
      record.worktreeName ?? null,
      record.sessionId ?? null,
      record.pid ?? null,
      record.prompt ?? null,
      record.command ?? null,
      record.timeoutMs ?? null,
      record.stallTimeoutMs ?? null,
      record.summary ?? null,
      record.resultText ?? null,
      record.output ?? null,
      record.exitCode ?? null,
      record.pauseReason ?? null,
      record.statusDetail ?? null,
      record.createdAt,
      record.updatedAt,
      record.finishedAt ?? null,
    );

    return this.load(record.id);
  }

  load(executionId: string): ExecutionRecord {
    const row = this.loadRow(executionId);
    if (!row) {
      throw new Error(`Execution ${executionId} not found.`);
    }

    return mapExecutionRow(row);
  }

  save(record: ExecutionRecord): ExecutionRecord {
    const normalized = normalizeExecution(record);
    const currentRow = this.loadRow(normalized.id);
    if (!currentRow) {
      throw new Error(`Execution ${normalized.id} not found.`);
    }

    assertExecutionSaveAllowed(mapExecutionRow(currentRow), normalized);
    return this.persist(normalized);
  }

  start(
    executionId: string,
    input: {
      pid?: number;
      sessionId?: string;
      cwd?: string;
      worktreeName?: string;
    } = {},
  ): ExecutionRecord {
    const current = this.load(executionId);
    return this.persist(applyExecutionStart(current, input));
  }

  close(executionId: string, input: ExecutionCloseInput): ExecutionRecord {
    const current = this.load(executionId);
    return this.persist(applyExecutionClose(current, input));
  }

  list(): ExecutionRecord[] {
    const rows = this.db.prepare(`
      SELECT
        id,
        lane,
        profile,
        launch_mode,
        requested_by,
        actor_name,
        actor_role,
        task_id,
        cwd,
        status,
        worktree_policy,
        worktree_name,
        session_id,
        pid,
        prompt,
        command,
        timeout_ms,
        stall_timeout_ms,
        summary,
        result_text,
        output,
        exit_code,
        pause_reason,
        status_detail,
        created_at,
        updated_at,
        finished_at
      FROM executions
      ORDER BY created_at DESC
    `).all() as ExecutionRow[];
    return rows.map((row) => mapExecutionRow(row));
  }

  private persist(record: ExecutionRecord): ExecutionRecord {
    const normalized = normalizeExecution(record);
    this.db.prepare(`
      INSERT INTO executions (
        id,
        lane,
        profile,
        launch_mode,
        requested_by,
        actor_name,
        actor_role,
        task_id,
        cwd,
        status,
        worktree_policy,
        worktree_name,
        session_id,
        pid,
        prompt,
        command,
        timeout_ms,
        stall_timeout_ms,
        summary,
        result_text,
        output,
        exit_code,
        pause_reason,
        status_detail,
        created_at,
        updated_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lane = excluded.lane,
        profile = excluded.profile,
        launch_mode = excluded.launch_mode,
        requested_by = excluded.requested_by,
        actor_name = excluded.actor_name,
        actor_role = excluded.actor_role,
        task_id = excluded.task_id,
        cwd = excluded.cwd,
        status = excluded.status,
        worktree_policy = excluded.worktree_policy,
        worktree_name = excluded.worktree_name,
        session_id = excluded.session_id,
        pid = excluded.pid,
        prompt = excluded.prompt,
        command = excluded.command,
        timeout_ms = excluded.timeout_ms,
        stall_timeout_ms = excluded.stall_timeout_ms,
        summary = excluded.summary,
        result_text = excluded.result_text,
        output = excluded.output,
        exit_code = excluded.exit_code,
        pause_reason = excluded.pause_reason,
        status_detail = excluded.status_detail,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        finished_at = excluded.finished_at
    `).run(
      normalized.id,
      normalized.lane,
      normalized.profile,
      normalized.launch,
      normalized.requestedBy,
      normalized.actorName,
      normalized.actorRole ?? null,
      normalized.taskId ?? null,
      normalized.cwd,
      normalized.status,
      normalized.worktreePolicy,
      normalized.worktreeName ?? null,
      normalized.sessionId ?? null,
      normalized.pid ?? null,
      normalized.prompt ?? null,
      normalized.command ?? null,
      normalized.timeoutMs ?? null,
      normalized.stallTimeoutMs ?? null,
      normalized.summary ?? null,
      normalized.resultText ?? null,
      normalized.output ?? null,
      normalized.exitCode ?? null,
      normalized.pauseReason ?? null,
      normalized.statusDetail ?? null,
      normalized.createdAt,
      normalized.updatedAt,
      normalized.finishedAt ?? null,
    );

    return this.load(normalized.id);
  }

  private loadRow(executionId: string): ExecutionRow | undefined {
    return this.db.prepare(`
      SELECT
        id,
        lane,
        profile,
        launch_mode,
        requested_by,
        actor_name,
        actor_role,
        task_id,
        cwd,
        status,
        worktree_policy,
        worktree_name,
        session_id,
        pid,
        prompt,
        command,
        timeout_ms,
        stall_timeout_ms,
        summary,
        result_text,
        output,
        exit_code,
        pause_reason,
        status_detail,
        created_at,
        updated_at,
        finished_at
      FROM executions
      WHERE id = ?
    `).get(normalizeExecutionId(executionId)) as ExecutionRow | undefined;
  }
}

interface ExecutionRow {
  id: string;
  lane: string;
  profile: string;
  launch_mode: string;
  requested_by: string;
  actor_name: string;
  actor_role: string | null;
  task_id: number | null;
  cwd: string;
  status: string;
  worktree_policy: string;
  worktree_name: string | null;
  session_id: string | null;
  pid: number | null;
  prompt: string | null;
  command: string | null;
  timeout_ms: number | null;
  stall_timeout_ms: number | null;
  summary: string | null;
  result_text: string | null;
  output: string | null;
  exit_code: number | null;
  pause_reason: string | null;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return normalizeExecution({
    id: row.id,
    lane: row.lane as ExecutionLane,
    profile: row.profile as ExecutionProfile,
    launch: row.launch_mode as ExecutionLaunchMode,
    requestedBy: row.requested_by,
    actorName: row.actor_name,
    actorRole: row.actor_role ?? undefined,
    taskId: row.task_id ?? undefined,
    cwd: row.cwd,
    status: row.status as ExecutionStatus,
    worktreePolicy: row.worktree_policy as ExecutionWorktreePolicy,
    worktreeName: row.worktree_name ?? undefined,
    sessionId: row.session_id ?? undefined,
    pid: row.pid ?? undefined,
    prompt: row.prompt ?? undefined,
    command: row.command ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
    stallTimeoutMs: row.stall_timeout_ms ?? undefined,
    summary: row.summary ?? undefined,
    resultText: row.result_text ?? undefined,
    output: row.output ?? undefined,
    exitCode: row.exit_code ?? undefined,
    pauseReason: row.pause_reason ?? undefined,
    statusDetail: row.status_detail ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  });
}

function normalizeExecution(record: Omit<ExecutionRecord, "boundary"> & Partial<Pick<ExecutionRecord, "boundary">>): ExecutionRecord {
  const now = currentTimestamp();
  const profile = normalizeProfile(record.profile);
  const timeoutMs = normalizeOptionalNumber(record.timeoutMs);
  const stallTimeoutMs = normalizeOptionalNumber(record.stallTimeoutMs);
  const boundary = resolveExecutionBoundary({
    profile,
    timeoutMs,
    stallTimeoutMs,
  });
  return {
    id: normalizeExecutionId(record.id) || createExecutionId(),
    lane: normalizeLane(record.lane),
    profile,
    launch: normalizeLaunch(record.launch),
    requestedBy: normalizeText(record.requestedBy) || "lead",
    actorName: normalizeText(record.actorName) || "execution",
    actorRole: normalizeOptionalText(record.actorRole),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? Math.trunc(record.taskId) : undefined,
    cwd: normalizeText(record.cwd),
    status: normalizeStatus(record.status),
    worktreePolicy: normalizeWorktreePolicy(record.worktreePolicy),
    worktreeName: normalizeOptionalText(record.worktreeName),
    sessionId: normalizeOptionalText(record.sessionId),
    pid: typeof record.pid === "number" && Number.isFinite(record.pid) ? Math.trunc(record.pid) : undefined,
    prompt: normalizeOptionalText(record.prompt),
    command: normalizeOptionalText(record.command),
    timeoutMs: boundary.maxRuntimeMs,
    stallTimeoutMs: boundary.maxIdleMs,
    boundary,
    summary: normalizeOptionalText(record.summary),
    resultText: normalizeOptionalText(record.resultText),
    output: normalizeOptionalText(record.output),
    exitCode: typeof record.exitCode === "number" && Number.isFinite(record.exitCode)
      ? Math.trunc(record.exitCode)
      : undefined,
    pauseReason: normalizeOptionalText(record.pauseReason),
    statusDetail: normalizeOptionalText(record.statusDetail),
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
    finishedAt: normalizeOptionalText(record.finishedAt),
  };
}

function normalizeLane(value: string): ExecutionLane {
  if (value === "agent" || value === "command") {
    return value;
  }

  throw new Error(`Invalid execution lane '${String(value)}'.`);
}

function normalizeProfile(value: string): ExecutionProfile {
  switch (value) {
    case "subagent":
      return "subagent";
    case "background":
      return "background";
    case "teammate":
      return "teammate";
    default:
      throw new Error(`Invalid execution profile '${String(value)}'.`);
  }
}

function normalizeLaunch(value: string): ExecutionLaunchMode {
  if (value === "worker") {
    return value;
  }

  throw new Error(`Invalid execution launch mode '${String(value)}'.`);
}

function normalizeWorktreePolicy(value: string | undefined): ExecutionWorktreePolicy {
  if (value === undefined || value === "none" || value === "task") {
    return value ?? "none";
  }

  throw new Error(`Invalid execution worktree policy '${String(value)}'.`);
}

function normalizeStatus(value: string): ExecutionStatus {
  switch (value) {
    case "queued":
      return "queued";
    case "running":
    case "paused":
    case "completed":
    case "failed":
    case "aborted":
      return value;
    default:
      throw new Error(`Invalid execution status '${String(value)}'.`);
  }
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function normalizeExecutionId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function createExecutionId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

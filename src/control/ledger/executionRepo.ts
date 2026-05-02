import type Database from "better-sqlite3";

import type { AssignmentContract } from "../../protocol/assignment.js";
import type { ExecutionPolicySnapshot } from "../../protocol/executionPolicy.js";
import type { CapabilityPackage } from "../../protocol/package.js";
import type {
  ExecutionCloseInput,
  ExecutionLaunchMode,
  ExecutionLane,
  ExecutionProfile,
  ExecutionRecord,
  ExecutionWorktreePolicy,
} from "../../execution/types.js";
import { normalizeLeadWaitPolicy, type LeadWaitPolicyInput } from "../../protocol/leadWait.js";
import { createExecutionId, normalizeExecution, normalizeExecutionId } from "./executionRecord.js";
import { applyExecutionClose, applyExecutionStart, assertExecutionSaveAllowed } from "./executionLifecycle.js";
import { mapExecutionRow, type ExecutionRow } from "./executionRow.js";
import { executionRecordValues } from "./executionStatement.js";
import { EXECUTION_COLUMN_LIST, EXECUTION_UPDATE_ASSIGNMENTS, EXECUTION_VALUE_PLACEHOLDERS } from "./executionSql.js";
import { currentTimestamp } from "./shared.js";

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
    objectiveKey?: string;
    objectiveText?: string;
    cwd: string;
    worktreePolicy?: ExecutionWorktreePolicy;
    prompt?: string;
    command?: string;
    timeoutMs?: number;
    stallTimeoutMs?: number;
    waitPolicy?: LeadWaitPolicyInput;
    assignment?: AssignmentContract;
    capabilityPackage?: CapabilityPackage;
    executionPolicy?: ExecutionPolicySnapshot;
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
      objectiveKey: input.objectiveKey,
      objectiveText: input.objectiveText,
      cwd: input.cwd,
      status: "queued",
      worktreePolicy: input.worktreePolicy ?? "none",
      prompt: input.prompt,
      command: input.command,
      timeoutMs: input.timeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
      waitPolicy: input.waitPolicy ? normalizeLeadWaitPolicy(input.waitPolicy) : undefined,
      assignmentSnapshot: input.assignment,
      capabilityPackageSnapshot: input.capabilityPackage,
      executionPolicy: input.executionPolicy,
      createdAt: now,
      updatedAt: now,
    });

    this.db.prepare(`
      INSERT INTO executions (
        ${EXECUTION_COLUMN_LIST}
      ) VALUES (${EXECUTION_VALUE_PLACEHOLDERS})
    `).run(...executionRecordValues(record));

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
        ${EXECUTION_COLUMN_LIST}
      FROM executions
      ORDER BY created_at DESC
    `).all() as ExecutionRow[];
    return rows.map((row) => mapExecutionRow(row));
  }

  private persist(record: ExecutionRecord): ExecutionRecord {
    const normalized = normalizeExecution(record);
    this.db.prepare(`
      INSERT INTO executions (
        ${EXECUTION_COLUMN_LIST}
      ) VALUES (${EXECUTION_VALUE_PLACEHOLDERS})
      ON CONFLICT(id) DO UPDATE SET
        ${EXECUTION_UPDATE_ASSIGNMENTS}
    `).run(...executionRecordValues(normalized));

    return this.load(normalized.id);
  }

  private loadRow(executionId: string): ExecutionRow | undefined {
    return this.db.prepare(`
      SELECT
        ${EXECUTION_COLUMN_LIST}
      FROM executions
      WHERE id = ?
    `).get(normalizeExecutionId(executionId)) as ExecutionRow | undefined;
  }
}

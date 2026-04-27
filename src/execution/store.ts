import { withProjectLedger } from "../control/ledger/open.js";
import { ExecutionLedgerRepo } from "../control/ledger/executionRepo.js";
import { publishExecutionWakeSignal, type WakeSignalReason } from "../protocol/wakeSignal.js";
import type { ExecutionCloseInput, ExecutionRecord, ExecutionStartInput } from "./types.js";

export class ExecutionStore {
  constructor(private readonly rootDir: string) {}

  async create(input: {
    id?: string;
    lane: ExecutionRecord["lane"];
    profile: ExecutionRecord["profile"];
    launch: ExecutionRecord["launch"];
    requestedBy: string;
    actorName: string;
    actorRole?: string;
    taskId?: number;
    objectiveKey?: string;
    objectiveText?: string;
    cwd: string;
    worktreePolicy?: ExecutionRecord["worktreePolicy"];
    prompt?: string;
    command?: string;
    timeoutMs?: number;
    stallTimeoutMs?: number;
  }): Promise<ExecutionRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).create(input));
  }

  async load(executionId: string): Promise<ExecutionRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).load(executionId));
  }

  async save(record: ExecutionRecord): Promise<ExecutionRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).save(record));
  }

  async start(executionId: string, input: ExecutionStartInput = {}): Promise<ExecutionRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).start(executionId, input));
  }

  async close(executionId: string, input: ExecutionCloseInput): Promise<ExecutionRecord> {
    const closed = await withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).close(executionId, input));
    await publishExecutionWakeSignal(this.rootDir, {
      executionId: closed.id,
      reason: toWakeSignalReason(closed.status),
    });
    return closed;
  }

  async list(): Promise<ExecutionRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new ExecutionLedgerRepo(db).list());
  }

  async listRelevant(options: {
    requestedBy?: string;
    actorName?: string;
    taskId?: number;
    profile?: ExecutionRecord["profile"];
    statuses?: ExecutionRecord["status"][];
  } = {}): Promise<ExecutionRecord[]> {
    const statuses = new Set(options.statuses ?? []);
    return (await this.list()).filter((record) => {
      if (options.requestedBy && record.requestedBy !== options.requestedBy) {
        return false;
      }
      if (options.actorName && record.actorName !== options.actorName) {
        return false;
      }
      if (typeof options.taskId === "number" && record.taskId !== options.taskId) {
        return false;
      }
      if (options.profile && record.profile !== options.profile) {
        return false;
      }
      if (statuses.size > 0 && !statuses.has(record.status)) {
        return false;
      }

      return true;
    });
  }
}

function toWakeSignalReason(status: ExecutionRecord["status"]): WakeSignalReason {
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "aborted") {
    return "aborted";
  }
  if (status === "paused") {
    return "paused";
  }
  return "failed";
}

import { withProjectLedger } from "../control/ledger/open.js";
import { TaskLedgerRepo } from "../control/ledger/taskRepo.js";
import type { TaskRecord, TaskStatus } from "./types.js";
import type { TodoItem } from "../types.js";
import { readOrchestratorMetadata } from "../orchestrator/metadata.js";

export class TaskStore {
  constructor(private readonly rootDir: string) {}

  async create(
    subject: string,
    description = "",
    options: { assignee?: string } = {},
  ): Promise<TaskRecord> {
    assertExternalTaskText(subject, "subject");
    assertExternalTaskText(description, "description");
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).create(subject, description, options));
  }

  async load(taskId: number): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).load(taskId));
  }

  async save(task: TaskRecord): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).save(task));
  }

  async update(
    taskId: number,
    updates: {
      status?: TaskStatus;
      addBlockedBy?: number[];
      addBlocks?: number[];
      assignee?: string;
      owner?: string;
      worktree?: string;
    },
  ): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).update(taskId, updates));
  }

  async claim(taskId: number, owner: string): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).claim(taskId, owner));
  }

  async setChecklist(taskId: number, checklist: TodoItem[]): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).setChecklist(taskId, checklist));
  }

  async findOwnedActive(owner: string): Promise<TaskRecord | undefined> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).findOwnedActive(owner));
  }

  async assign(taskId: number, assignee: string): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).assign(taskId, assignee));
  }

  async releaseOwner(owner: string): Promise<TaskRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).releaseOwner(owner));
  }

  async bindWorktree(taskId: number, worktree: string): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).bindWorktree(taskId, worktree));
  }

  async unbindWorktree(taskId: number): Promise<TaskRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).unbindWorktree(taskId));
  }

  async list(): Promise<TaskRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).list());
  }

  async listClaimable(owner?: string): Promise<TaskRecord[]> {
    return withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).listClaimable(owner));
  }

  async summarize(options: { objectiveKey?: string } = {}): Promise<string> {
    const allTasks = await this.list();
    const tasks = options.objectiveKey
      ? allTasks.filter((task) => readOrchestratorMetadata(task.description)?.key === options.objectiveKey)
      : allTasks;
    if (tasks.length === 0) {
      return "No tasks.";
    }

    const lines = tasks
      .map((task) => {
        const marker = task.status === "completed" ? "[x]" : task.status === "in_progress" ? "[>]" : "[ ]";
        const blocked = task.blockedBy.length > 0 ? ` blockedBy=${task.blockedBy.join(",")}` : "";
        const blocks = task.blocks.length > 0 ? ` blocks=${task.blocks.join(",")}` : "";
        const checklist = task.checklist && task.checklist.length > 0
          ? ` plan=${task.checklist.filter((item) => item.status === "completed").length}/${task.checklist.length}`
          : "";
        const assignee = task.assignee ? ` ->${task.assignee}` : "";
        const owner = task.owner ? ` @${task.owner}` : "";
        const worktree = task.worktree ? ` wt=${task.worktree}` : "";
        return `${marker} #${task.id}: ${task.subject}${blocked}${blocks}${checklist}${assignee}${owner}${worktree}`;
      })
      .join("\n");
    return lines;
  }
}

function assertExternalTaskText(value: string, field: string): void {
  if (String(value ?? "").toLowerCase().includes("[internal]")) {
    throw new Error(`Task ${field} cannot contain internal runtime wake text.`);
  }
}

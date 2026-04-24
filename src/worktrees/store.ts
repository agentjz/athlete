import fs from "node:fs/promises";
import path from "node:path";

import { withProjectLedger } from "../control/ledger/open.js";
import { TaskLedgerRepo } from "../control/ledger/taskRepo.js";
import { WorktreeLedgerRepo, normalizeWorktreeName, normalizeWorktreeRecord } from "../control/ledger/worktreeRepo.js";
import { ensureProjectStateDirectories } from "../project/statePaths.js";
import type { WorktreeEventRecord, WorktreeRecord, WorktreeStatus } from "./types.js";
import { branchExists, ensureGitRepository, runGitCommand } from "./git.js";
import { appendWorktreeEvent, formatWorktreeMarker, readWorktreeError, readWorktreeEvents } from "./events.js";
import { pathExists } from "./fs.js";
import { bindTaskToWorktree, reserveAvailableWorktreeName, resolveTaskCwdFromLedger } from "./ledger.js";

export class WorktreeStore {
  constructor(private readonly rootDir: string) {}

  async create(name: string, taskId?: number): Promise<WorktreeRecord> {
    await ensureGitRepository(this.rootDir);
    await this.reconcile();

    const normalizedName = normalizeWorktreeName(name);
    if (!normalizedName) {
      throw new Error("Worktree name is required.");
    }

    const existing = await this.find(normalizedName);
    if (existing && existing.status !== "removed") {
      if (typeof taskId === "number") {
        await bindTaskToWorktree(this.rootDir, existing.name, taskId);
      }
      return (await this.find(normalizedName)) ?? existing;
    }

    const paths = await ensureProjectStateDirectories(this.rootDir);
    const record = normalizeWorktreeRecord({
      name: normalizedName,
      path: path.join(paths.worktreesDir, normalizedName),
      branch: existing?.branch || `wt/${normalizedName}`,
      status: "active",
      taskId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await this.emit({
      event: "worktree.create.before",
      ts: Date.now(),
      task: typeof taskId === "number" ? { id: taskId } : undefined,
      worktree: {
        name: record.name,
        status: record.status,
        path: record.path,
        branch: record.branch,
      },
    });

    try {
      const exists = await branchExists(this.rootDir, record.branch);
      await runGitCommand(
        this.rootDir,
        exists
          ? ["worktree", "add", record.path, record.branch]
          : ["worktree", "add", "-b", record.branch, record.path, "HEAD"],
      );
      await withProjectLedger(this.rootDir, ({ db }) => {
        const worktrees = new WorktreeLedgerRepo(db);
        const tasks = new TaskLedgerRepo(db);
        worktrees.upsert(record);
        if (typeof taskId === "number") {
          tasks.bindWorktree(taskId, record.name);
        }
      });
      const next = await this.get(record.name);
      await this.emit({
        event: "worktree.create.after",
        ts: Date.now(),
        task: typeof taskId === "number" ? { id: taskId, worktree: record.name } : undefined,
        worktree: {
          name: next.name,
          status: next.status,
          path: next.path,
          branch: next.branch,
        },
      });
      return next;
    } catch (error) {
      await this.emit({
        event: "worktree.create.failed",
        ts: Date.now(),
        task: typeof taskId === "number" ? { id: taskId } : undefined,
        worktree: {
          name: record.name,
          status: record.status,
          path: record.path,
          branch: record.branch,
        },
        error: readWorktreeError(error),
      });
      throw error;
    }
  }

  async ensureForTask(taskId: number, preferredName?: string): Promise<WorktreeRecord> {
    const task = await withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).load(taskId));
    if (task.worktree) {
      const bound = await this.find(task.worktree);
      if (bound && bound.status !== "removed") {
        return bound;
      }
      await withProjectLedger(this.rootDir, ({ db }) => new TaskLedgerRepo(db).unbindWorktree(taskId));
    }

    const baseName = normalizeWorktreeName(preferredName || task.subject || `task-${taskId}`);
    const name = await reserveAvailableWorktreeName(this.rootDir, baseName || `task-${taskId}`);
    return this.create(name, taskId);
  }

  async get(name: string): Promise<WorktreeRecord> {
    return withProjectLedger(this.rootDir, ({ db }) => new WorktreeLedgerRepo(db).get(name));
  }

  async find(name: string): Promise<WorktreeRecord | undefined> {
    return withProjectLedger(this.rootDir, ({ db }) => new WorktreeLedgerRepo(db).find(name));
  }

  async list(): Promise<WorktreeRecord[]> {
    await this.reconcile();
    return withProjectLedger(this.rootDir, ({ db }) => new WorktreeLedgerRepo(db).list());
  }

  async findByPath(cwd: string): Promise<WorktreeRecord | undefined> {
    const resolvedCwd = path.resolve(cwd);
    const worktrees = await this.list();
    return worktrees.find((worktree) => {
      if (worktree.status === "removed") {
        return false;
      }
      const relative = path.relative(worktree.path, resolvedCwd);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
  }

  async keep(name: string): Promise<WorktreeRecord> {
    const worktree = await this.get(name);
    const next = await withProjectLedger(this.rootDir, ({ db }) =>
      new WorktreeLedgerRepo(db).upsert({
        ...worktree,
        status: "kept",
        updatedAt: new Date().toISOString(),
      }));
    await this.emit({
      event: "worktree.keep",
      ts: Date.now(),
      task: typeof next.taskId === "number" ? { id: next.taskId, worktree: next.name } : undefined,
      worktree: {
        name: next.name,
        status: next.status,
        path: next.path,
        branch: next.branch,
      },
    });
    return next;
  }

  async remove(name: string, options: { force?: boolean; completeTask?: boolean } = {}): Promise<WorktreeRecord> {
    await ensureGitRepository(this.rootDir);
    const worktree = await this.get(name);
    await this.emit({
      event: "worktree.remove.before",
      ts: Date.now(),
      task: typeof worktree.taskId === "number" ? { id: worktree.taskId, worktree: worktree.name } : undefined,
      worktree: {
        name: worktree.name,
        status: worktree.status,
        path: worktree.path,
        branch: worktree.branch,
      },
    });

    try {
      const args = ["worktree", "remove"];
      if (options.force) {
        args.push("--force");
      }
      args.push(worktree.path);
      await runGitCommand(this.rootDir, args);
      await runGitCommand(this.rootDir, ["worktree", "prune"]).catch(() => null);

      const next = await withProjectLedger(this.rootDir, ({ db }) => {
        const worktrees = new WorktreeLedgerRepo(db);
        const tasks = new TaskLedgerRepo(db);
        if (typeof worktree.taskId === "number") {
          if (options.completeTask) {
            tasks.update(worktree.taskId, { status: "completed" });
          }
          tasks.unbindWorktree(worktree.taskId);
        }
        return worktrees.upsert({
          ...worktree,
          status: "removed",
          updatedAt: new Date().toISOString(),
        });
      });
      await this.emit({
        event: "worktree.remove.after",
        ts: Date.now(),
        task: typeof worktree.taskId === "number"
          ? { id: worktree.taskId, status: options.completeTask ? "completed" : undefined }
          : undefined,
        worktree: {
          name: next.name,
          status: next.status,
          path: next.path,
          branch: next.branch,
        },
      });
      return next;
    } catch (error) {
      await this.emit({
        event: "worktree.remove.failed",
        ts: Date.now(),
        task: typeof worktree.taskId === "number" ? { id: worktree.taskId, worktree: worktree.name } : undefined,
        worktree: {
          name: worktree.name,
          status: worktree.status,
          path: worktree.path,
          branch: worktree.branch,
        },
        error: readWorktreeError(error),
      });
      throw error;
    }
  }

  async summarize(): Promise<string> {
    const worktrees = await this.list();
    if (worktrees.length === 0) {
      return "No worktrees.";
    }

    return worktrees
      .map((worktree) => {
        const marker = formatWorktreeMarker(worktree.status);
        const task = typeof worktree.taskId === "number" ? ` task=${worktree.taskId}` : "";
        return `${marker} ${worktree.name}${task} branch=${worktree.branch}`;
      })
      .join("\n");
  }

  async readEvents(limit = 20): Promise<WorktreeEventRecord[]> {
    return readWorktreeEvents(this.rootDir, limit);
  }

  async reconcile(): Promise<void> {
    const worktrees = await withProjectLedger(this.rootDir, ({ db }) => new WorktreeLedgerRepo(db).list());
    const nextStatuses = await Promise.all(worktrees.map(async (record) => ({
      record,
      exists: await pathExists(record.path),
    })));

    await withProjectLedger(this.rootDir, ({ db }) => {
      const worktreeRepo = new WorktreeLedgerRepo(db);
      const taskRepo = new TaskLedgerRepo(db);
      for (const { record, exists } of nextStatuses) {
        const nextStatus: WorktreeStatus =
          record.status === "removed"
            ? "removed"
            : exists
              ? record.status
              : "removed";
        worktreeRepo.upsert({
          ...record,
          status: nextStatus,
        });
      }

      for (const task of taskRepo.list()) {
        if (!task.worktree) {
          continue;
        }
        const bound = worktreeRepo.find(task.worktree);
        if (!bound || bound.status === "removed") {
          taskRepo.unbindWorktree(task.id);
        }
      }
    });
  }

  async resolveTaskCwd(taskId: number): Promise<string> {
    return resolveTaskCwdFromLedger(this.rootDir, taskId);
  }

  private async emit(event: WorktreeEventRecord): Promise<void> {
    await appendWorktreeEvent(this.rootDir, event);
  }
}

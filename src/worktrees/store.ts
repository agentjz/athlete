import fs from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";

import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import { TaskStore } from "../tasks/store.js";
import type { TaskRecord } from "../tasks/types.js";
import type { WorktreeEventRecord, WorktreeIndexRecord, WorktreeRecord, WorktreeStatus } from "./types.js";

export class WorktreeStore {
  constructor(private readonly rootDir: string) {}

  async create(name: string, taskId?: number): Promise<WorktreeRecord> {
    await this.ensureGitRepo();
    await this.reconcile();

    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      throw new Error("Worktree name is required.");
    }

    const existing = await this.find(normalizedName);
    if (existing && existing.status !== "removed") {
      if (typeof taskId === "number") {
        await this.bindTask(existing.name, taskId);
      }
      return (await this.find(normalizedName)) ?? existing;
    }

    const paths = await ensureProjectStateDirectories(this.rootDir);
    const record: WorktreeRecord = normalizeWorktree({
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
      const branchExists = await this.branchExists(record.branch);
      await this.runGit(
        branchExists
          ? ["worktree", "add", record.path, record.branch]
          : ["worktree", "add", "-b", record.branch, record.path, "HEAD"],
      );
      await this.upsertRecord(record);
      if (typeof taskId === "number") {
        await this.bindTask(record.name, taskId);
      }
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
        error: readError(error),
      });
      throw error;
    }
  }

  async ensureForTask(taskId: number, preferredName?: string): Promise<WorktreeRecord> {
    const taskStore = new TaskStore(this.rootDir);
    const task = await taskStore.load(taskId);
    if (task.worktree) {
      const bound = await this.find(task.worktree);
      if (bound && bound.status !== "removed") {
        return bound;
      }

      await taskStore.unbindWorktree(taskId);
    }

    const baseName = normalizeName(preferredName || task.subject || `task-${taskId}`);
    const name = await this.reserveAvailableName(baseName || `task-${taskId}`);
    return this.create(name, taskId);
  }

  async get(name: string): Promise<WorktreeRecord> {
    const existing = await this.find(name);
    if (!existing) {
      throw new Error(`Unknown worktree: ${name}`);
    }
    return existing;
  }

  async find(name: string): Promise<WorktreeRecord | undefined> {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      return undefined;
    }
    const index = await this.loadIndex();
    return index.items.find((item) => item.name === normalizedName);
  }

  async list(): Promise<WorktreeRecord[]> {
    await this.reconcile();
    return (await this.loadIndex()).items
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
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
    const next = await this.upsertRecord({
      ...worktree,
      status: "kept",
      updatedAt: new Date().toISOString(),
    });
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

  async remove(
    name: string,
    options: {
      force?: boolean;
      completeTask?: boolean;
    } = {},
  ): Promise<WorktreeRecord> {
    await this.ensureGitRepo();
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
      await this.runGit(args);
      await this.runGit(["worktree", "prune"]).catch(() => null);

      if (typeof worktree.taskId === "number") {
        const taskStore = new TaskStore(this.rootDir);
        if (options.completeTask) {
          await taskStore.update(worktree.taskId, { status: "completed" });
        }
        await taskStore.unbindWorktree(worktree.taskId);
      }

      const next = await this.upsertRecord({
        ...worktree,
        status: "removed",
        updatedAt: new Date().toISOString(),
      });
      await this.emit({
        event: "worktree.remove.after",
        ts: Date.now(),
        task:
          typeof worktree.taskId === "number"
            ? {
                id: worktree.taskId,
                status: options.completeTask ? "completed" : undefined,
              }
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
        error: readError(error),
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
        const marker = formatMarker(worktree.status);
        const task = typeof worktree.taskId === "number" ? ` task=${worktree.taskId}` : "";
        return `${marker} ${worktree.name}${task} branch=${worktree.branch}`;
      })
      .join("\n");
  }

  async readEvents(limit = 20): Promise<WorktreeEventRecord[]> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    try {
      const raw = await fs.readFile(paths.worktreeEventsFile, "utf8");
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as WorktreeEventRecord)
        .slice(-Math.max(1, Math.trunc(limit)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async reconcile(): Promise<void> {
    const index = await this.loadIndex();
    const nextItems: WorktreeRecord[] = [];

    for (const record of index.items) {
      const exists = await pathExists(record.path);
      const nextStatus: WorktreeStatus =
        record.status === "removed"
          ? "removed"
          : exists
            ? record.status
            : "removed";
      nextItems.push({
        ...record,
        status: nextStatus,
      });
    }

    const taskStore = new TaskStore(this.rootDir);
    const tasks = await taskStore.list();
    for (const task of tasks) {
      if (!task.worktree) {
        continue;
      }

      const bound = nextItems.find((item) => item.name === task.worktree && item.status !== "removed");
      if (!bound) {
        await taskStore.unbindWorktree(task.id);
      }
    }

    await this.saveIndex({ items: nextItems });
  }

  async resolveTaskCwd(taskId: number): Promise<string> {
    const task = await new TaskStore(this.rootDir).load(taskId);
    if (!task.worktree) {
      return this.rootDir;
    }

    const worktree = await this.find(task.worktree);
    if (!worktree || worktree.status === "removed") {
      return this.rootDir;
    }

    return worktree.path;
  }

  private async bindTask(worktreeName: string, taskId: number): Promise<void> {
    const worktree = await this.get(worktreeName);
    await new TaskStore(this.rootDir).bindWorktree(taskId, worktree.name);
    await this.upsertRecord({
      ...worktree,
      taskId,
      updatedAt: new Date().toISOString(),
    });
  }

  private async reserveAvailableName(baseName: string): Promise<string> {
    const normalizedBase = normalizeName(baseName) || "task";
    const existing = new Set((await this.loadIndex()).items.map((item) => item.name));
    if (!existing.has(normalizedBase)) {
      return normalizedBase;
    }

    for (let suffix = 2; suffix < 10_000; suffix += 1) {
      const candidate = `${normalizedBase}-${suffix}`;
      if (!existing.has(candidate)) {
        return candidate;
      }
    }

    throw new Error(`Unable to reserve a worktree name from '${baseName}'.`);
  }

  private async loadIndex(): Promise<WorktreeIndexRecord> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    try {
      const raw = await fs.readFile(paths.worktreeIndexFile, "utf8");
      return normalizeIndex(JSON.parse(raw) as WorktreeIndexRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const empty = normalizeIndex({ items: [] });
        await this.saveIndex(empty);
        return empty;
      }
      throw error;
    }
  }

  private async saveIndex(index: WorktreeIndexRecord): Promise<void> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const normalized = normalizeIndex(index);
    await fs.writeFile(paths.worktreeIndexFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  }

  private async upsertRecord(record: WorktreeRecord): Promise<WorktreeRecord> {
    const index = await this.loadIndex();
    const normalized = normalizeWorktree(record);
    const nextItems = index.items.some((item) => item.name === normalized.name)
      ? index.items.map((item) => (item.name === normalized.name ? normalized : item))
      : [...index.items, normalized];
    await this.saveIndex({ items: nextItems });
    return normalized;
  }

  private async emit(event: WorktreeEventRecord): Promise<void> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    await fs.appendFile(paths.worktreeEventsFile, `${JSON.stringify(event)}\n`, "utf8");
  }

  private async ensureGitRepo(): Promise<void> {
    try {
      await this.runGit(["rev-parse", "--show-toplevel"]);
    } catch {
      throw new Error("Worktree support requires a git repository.");
    }
  }

  private async branchExists(branch: string): Promise<boolean> {
    try {
      await this.runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async runGit(args: string[]): Promise<void> {
    await execa("git", ["-C", this.rootDir, ...args], {
      reject: true,
      timeout: 120_000,
      all: true,
      windowsHide: true,
    });
  }
}

function normalizeIndex(index: WorktreeIndexRecord): WorktreeIndexRecord {
  return {
    items: Array.isArray(index.items)
      ? index.items.map((item) => normalizeWorktree(item)).sort((left, right) => left.name.localeCompare(right.name))
      : [],
  };
}

function normalizeWorktree(record: WorktreeRecord): WorktreeRecord {
  const now = new Date().toISOString();
  return {
    name: normalizeName(record.name),
    path: path.resolve(String(record.path ?? "")),
    branch: String(record.branch ?? "").trim() || `wt/${normalizeName(record.name) || "task"}`,
    status: normalizeStatus(record.status),
    taskId: typeof record.taskId === "number" && Number.isFinite(record.taskId) ? Math.trunc(record.taskId) : undefined,
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
  };
}

function normalizeStatus(value: string): WorktreeStatus {
  switch (value) {
    case "kept":
    case "removed":
      return value;
    default:
      return "active";
  }
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatMarker(status: WorktreeStatus): string {
  switch (status) {
    case "kept":
      return "[k]";
    case "removed":
      return "[x]";
    default:
      return "[>]";
  }
}

function readError(error: unknown): string {
  return String((error as { all?: unknown; stderr?: unknown; message?: unknown }).all ??
    (error as { stderr?: unknown }).stderr ??
    (error as { message?: unknown }).message ??
    error);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

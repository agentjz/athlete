import fs from "node:fs/promises";
import path from "node:path";

import { normalizeTodoItems } from "../agent/todos.js";
import { ensureProjectStateDirectories, getProjectStatePaths } from "../project/statePaths.js";
import type { TaskRecord, TaskStatus } from "./types.js";
import type { TodoItem } from "../types.js";

export class TaskStore {
  constructor(private readonly rootDir: string) {}

  async create(
    subject: string,
    description = "",
    options: {
      assignee?: string;
    } = {},
  ): Promise<TaskRecord> {
    const normalizedSubject = normalizeText(subject);
    if (!normalizedSubject) {
      throw new Error("Task subject is required.");
    }

    const paths = await ensureProjectStateDirectories(this.rootDir);
    const nextId = (await this.getMaxId(paths.tasksDir)) + 1;
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: nextId,
      subject: normalizedSubject,
      description: normalizeText(description),
      status: "pending",
      blockedBy: [],
      blocks: [],
      assignee: normalizeText(options.assignee),
      owner: "",
      worktree: "",
      createdAt: now,
      updatedAt: now,
    };
    await this.save(task);
    return task;
  }

  async load(taskId: number): Promise<TaskRecord> {
    const filePath = this.getTaskPath(taskId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return normalizeTaskRecord(JSON.parse(raw) as TaskRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Task ${taskId} not found.`);
      }
      throw error;
    }
  }

  async save(task: TaskRecord): Promise<TaskRecord> {
    await ensureProjectStateDirectories(this.rootDir);
    const normalized = normalizeTaskRecord(task);
    await fs.writeFile(this.getTaskPath(normalized.id), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
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
    const task = await this.load(taskId);
    const addBlockedBy = uniqueNumbers(updates.addBlockedBy ?? []);
    const addBlocks = uniqueNumbers(updates.addBlocks ?? []);
    await this.assertDependencyUpdateIsValid(taskId, addBlockedBy, addBlocks);

    const nextStatus = updates.status ?? task.status;
    const nextBlockedBy = uniqueNumbers([...task.blockedBy, ...addBlockedBy]);
    const nextBlocks = uniqueNumbers([...task.blocks, ...addBlocks]);
    const nextChecklist =
      nextStatus === "completed"
        ? completeChecklist(task.checklist)
        : normalizeTaskChecklist(task.checklist);
    const nextAssignee = typeof updates.assignee === "string" ? normalizeText(updates.assignee) : task.assignee;
    const nextOwner = typeof updates.owner === "string" ? normalizeText(updates.owner) : task.owner;
    const nextWorktree = typeof updates.worktree === "string" ? normalizeText(updates.worktree) : task.worktree;

    if (task.status === "completed" && nextStatus !== "completed") {
      throw new Error(`Task ${taskId} is already completed and cannot be reopened.`);
    }

    if (nextStatus === "in_progress" && nextBlockedBy.length > 0) {
      throw new Error(`Task ${taskId} is blocked by ${nextBlockedBy.join(", ")} and cannot start.`);
    }

    if (nextOwner && nextBlockedBy.length > 0) {
      throw new Error(`Task ${taskId} is blocked by ${nextBlockedBy.join(", ")} and cannot be owned.`);
    }

    if (nextStatus === "completed" && nextBlockedBy.length > 0) {
      throw new Error(`Task ${taskId} is still blocked by ${nextBlockedBy.join(", ")}.`);
    }

    if (nextAssignee && nextOwner && nextOwner !== nextAssignee) {
      throw new Error(`Task ${taskId} is assigned to ${nextAssignee}, not ${nextOwner}.`);
    }

    const next: TaskRecord = {
      ...task,
      status: nextStatus,
      blockedBy: nextBlockedBy,
      blocks: nextBlocks,
      checklist: nextChecklist,
      assignee: nextAssignee,
      owner: nextOwner,
      worktree: nextWorktree,
      updatedAt: new Date().toISOString(),
    };

    await this.save(next);
    await Promise.all([
      ...addBlockedBy.map(async (blockerId) => this.addBlockLink(blockerId, taskId)),
      ...addBlocks.map(async (blockedTaskId) => this.addBlockedByLink(blockedTaskId, taskId)),
    ]);

    if (next.status === "completed" && task.status !== "completed") {
      await this.clearDependency(taskId);
    }

    return this.load(taskId);
  }

  async claim(taskId: number, owner: string): Promise<TaskRecord> {
    const normalizedOwner = normalizeText(owner);
    if (!normalizedOwner) {
      throw new Error("Task owner is required.");
    }

    const task = await this.load(taskId);
    if (task.status === "completed") {
      throw new Error(`Task ${taskId} is already completed.`);
    }

    if (task.blockedBy.length > 0) {
      throw new Error(`Task ${taskId} is blocked by ${task.blockedBy.join(", ")}.`);
    }

    if (task.assignee && task.assignee !== normalizedOwner) {
      throw new Error(`Task ${taskId} is assigned to ${task.assignee}.`);
    }

    if (task.owner && task.owner !== normalizedOwner) {
      throw new Error(`Task ${taskId} is already claimed by ${task.owner}.`);
    }

    return this.update(taskId, {
      owner: normalizedOwner,
      status: "in_progress",
    });
  }

  async setChecklist(taskId: number, checklist: TodoItem[]): Promise<TaskRecord> {
    const task = await this.load(taskId);
    return this.save({
      ...task,
      checklist: normalizeTaskChecklist(checklist),
      updatedAt: new Date().toISOString(),
    });
  }

  async findOwnedActive(owner: string): Promise<TaskRecord | undefined> {
    const normalizedOwner = normalizeText(owner);
    if (!normalizedOwner) {
      return undefined;
    }

    const tasks = await this.list();
    return tasks
      .filter((task) => task.owner === normalizedOwner && task.status !== "completed")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  async assign(taskId: number, assignee: string): Promise<TaskRecord> {
    const normalizedAssignee = normalizeText(assignee);
    if (!normalizedAssignee) {
      throw new Error("Task assignee is required.");
    }

    const task = await this.load(taskId);
    if (task.status === "completed") {
      throw new Error(`Task ${taskId} is already completed.`);
    }

    if (task.owner && task.owner !== normalizedAssignee) {
      throw new Error(`Task ${taskId} is already claimed by ${task.owner}.`);
    }

    return this.update(taskId, {
      assignee: normalizedAssignee,
    });
  }

  async releaseOwner(owner: string): Promise<TaskRecord[]> {
    const normalizedOwner = normalizeText(owner);
    if (!normalizedOwner) {
      return [];
    }

    const tasks = await this.list();
    const affected = tasks.filter((task) => task.owner === normalizedOwner && task.status !== "completed");
    const now = new Date().toISOString();

    await Promise.all(
      affected.map((task) =>
        this.save({
          ...task,
          owner: "",
          status: "pending",
          updatedAt: now,
        })),
    );

    return Promise.all(affected.map((task) => this.load(task.id)));
  }

  async bindWorktree(taskId: number, worktree: string): Promise<TaskRecord> {
    const task = await this.load(taskId);
    return this.save({
      ...task,
      worktree: normalizeText(worktree),
      status: task.status === "pending" ? "in_progress" : task.status,
      updatedAt: new Date().toISOString(),
    });
  }

  async unbindWorktree(taskId: number): Promise<TaskRecord> {
    const task = await this.load(taskId);
    return this.save({
      ...task,
      worktree: "",
      updatedAt: new Date().toISOString(),
    });
  }

  async list(): Promise<TaskRecord[]> {
    const paths = await ensureProjectStateDirectories(this.rootDir);
    const entries = await fs.readdir(paths.tasksDir, { withFileTypes: true });
    const tasks = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^task_\d+\.json$/i.test(entry.name))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(paths.tasksDir, entry.name), "utf8");
          return normalizeTaskRecord(JSON.parse(raw) as TaskRecord);
        }),
    );
    return tasks.sort((left, right) => left.id - right.id);
  }

  async listClaimable(owner?: string): Promise<TaskRecord[]> {
    const tasks = await this.list();
    const normalizedOwner = normalizeText(owner);
    const claimable = tasks.filter(
      (task) =>
        task.status !== "completed" &&
        task.blockedBy.length === 0 &&
        !task.owner &&
        (!normalizedOwner || !task.assignee || task.assignee === normalizedOwner),
    );

    if (!normalizedOwner) {
      return claimable;
    }

    return claimable.sort((left, right) => {
      const leftPriority = left.assignee === normalizedOwner ? 0 : 1;
      const rightPriority = right.assignee === normalizedOwner ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.id - right.id;
    });
  }

  async summarize(): Promise<string> {
    const tasks = await this.list();
    if (tasks.length === 0) {
      return "No tasks.";
    }

    return tasks
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
  }

  private async assertDependencyUpdateIsValid(
    taskId: number,
    addBlockedBy: number[],
    addBlocks: number[],
  ): Promise<void> {
    const newEdges = [
      ...addBlockedBy.map((blockerId) => [blockerId, taskId] as const),
      ...addBlocks.map((blockedTaskId) => [taskId, blockedTaskId] as const),
    ];

    if (newEdges.length === 0) {
      return;
    }

    for (const [blockerId, blockedTaskId] of newEdges) {
      if (blockerId === blockedTaskId) {
        throw new Error(`Task ${taskId} cannot depend on itself.`);
      }
    }

    await Promise.all(
      uniqueNumbers(newEdges.flatMap(([blockerId, blockedTaskId]) => [blockerId, blockedTaskId])).map((id) => this.load(id)),
    );

    const graph = buildGraph(await this.list());
    for (const [blockerId, blockedTaskId] of newEdges) {
      if (pathExists(graph, blockedTaskId, blockerId)) {
        throw new Error(
          `Task dependency cycle detected: adding ${blockerId} -> ${blockedTaskId} would create a loop.`,
        );
      }

      if (!graph.has(blockerId)) {
        graph.set(blockerId, new Set());
      }
      graph.get(blockerId)?.add(blockedTaskId);
    }
  }

  private async addBlockedByLink(taskId: number, blockerId: number): Promise<void> {
    const task = await this.load(taskId);
    if (task.blockedBy.includes(blockerId)) {
      return;
    }

    await this.save({
      ...task,
      blockedBy: uniqueNumbers([...task.blockedBy, blockerId]),
      updatedAt: new Date().toISOString(),
    });
  }

  private async addBlockLink(taskId: number, blockedTaskId: number): Promise<void> {
    const task = await this.load(taskId);
    if (task.blocks.includes(blockedTaskId)) {
      return;
    }

    await this.save({
      ...task,
      blocks: uniqueNumbers([...task.blocks, blockedTaskId]),
      updatedAt: new Date().toISOString(),
    });
  }

  private async clearDependency(completedId: number): Promise<void> {
    const tasks = await this.list();
    await Promise.all(
      tasks
        .filter((task) => task.blockedBy.includes(completedId))
        .map((task) =>
          this.save({
            ...task,
            blockedBy: task.blockedBy.filter((id) => id !== completedId),
            updatedAt: new Date().toISOString(),
          })),
    );
  }

  private getTaskPath(taskId: number): string {
    const paths = getProjectStatePaths(this.rootDir);
    return path.join(paths.tasksDir, `task_${taskId}.json`);
  }

  private async getMaxId(tasksDir: string): Promise<number> {
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    const ids = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.match(/^task_(\d+)\.json$/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));
    return ids.length > 0 ? Math.max(...ids) : 0;
  }
}

function normalizeTaskRecord(task: TaskRecord): TaskRecord {
  const now = new Date().toISOString();
  const status = normalizeStatus(task.status);

  return {
    id: Math.max(1, Math.trunc(task.id)),
    subject: normalizeText(task.subject),
    description: normalizeText(task.description),
    status,
    blockedBy: uniqueNumbers(task.blockedBy ?? []),
    blocks: uniqueNumbers(task.blocks ?? []),
    checklist: normalizeTaskChecklist(task.checklist),
    assignee: normalizeText(task.assignee),
    owner: normalizeText(task.owner),
    worktree: normalizeText(task.worktree),
    createdAt: typeof task.createdAt === "string" && task.createdAt ? task.createdAt : now,
    updatedAt: typeof task.updatedAt === "string" && task.updatedAt ? task.updatedAt : now,
  };
}

function normalizeStatus(value: string): TaskStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }

  return "pending";
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value)))]
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTaskChecklist(value: unknown): TodoItem[] {
  return normalizeTodoItems(value);
}

function completeChecklist(value: unknown): TodoItem[] {
  return normalizeTaskChecklist(value).map((item) => ({
    ...item,
    status: "completed",
  }));
}

function buildGraph(tasks: TaskRecord[]): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();
  for (const task of tasks) {
    if (!graph.has(task.id)) {
      graph.set(task.id, new Set());
    }

    for (const blockedTaskId of task.blocks) {
      graph.get(task.id)?.add(blockedTaskId);
    }
  }
  return graph;
}

function pathExists(graph: Map<number, Set<number>>, start: number, target: number): boolean {
  const queue = [start];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (typeof current !== "number" || visited.has(current)) {
      continue;
    }

    if (current === target) {
      return true;
    }

    visited.add(current);
    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  return false;
}

import type Database from "better-sqlite3";

import { uniqueNumbers } from "./taskRecord.js";

export interface TaskDependencyRow {
  blocker_task_id: number;
  blocked_task_id: number;
}

export function ensureTaskIdsExist(db: Database.Database, ids: number[]): void {
  const uniqueIds = uniqueNumbers(ids);
  if (uniqueIds.length === 0) {
    return;
  }

  const rows = db.prepare(`
    SELECT id
    FROM tasks
    WHERE id IN (${uniqueIds.map(() => "?").join(", ")})
  `).all(...uniqueIds) as Array<{ id: number }>;
  const existing = new Set(rows.map((row) => row.id));
  for (const id of uniqueIds) {
    if (!existing.has(id)) {
      throw new Error(`Task ${id} not found.`);
    }
  }
}

export function validateTaskDependencies(
  db: Database.Database,
  taskId: number,
  blockedBy: number[],
  blocks: number[],
  partial = false,
): void {
  const newEdges = [
    ...uniqueNumbers(blockedBy).map((blockerId) => [blockerId, taskId] as const),
    ...uniqueNumbers(blocks).map((blockedTaskId) => [taskId, blockedTaskId] as const),
  ];
  if (newEdges.length === 0) {
    return;
  }

  for (const [blockerId, blockedTaskId] of newEdges) {
    if (blockerId === blockedTaskId) {
      throw new Error(`Task ${taskId} cannot depend on itself.`);
    }
  }

  ensureTaskIdsExist(db, newEdges.flatMap(([blockerId, blockedTaskId]) => [blockerId, blockedTaskId]));
  const graph = buildDependencyGraph(db, partial ? undefined : taskId);
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

export function replaceTaskDependencies(
  db: Database.Database,
  taskId: number,
  blockedBy: number[],
  blocks: number[],
): void {
  db.prepare(`
    DELETE FROM task_dependencies
    WHERE blocker_task_id = ? OR blocked_task_id = ?
  `).run(taskId, taskId);

  const edges = [
    ...uniqueNumbers(blockedBy).map((blockerId) => [blockerId, taskId] as const),
    ...uniqueNumbers(blocks).map((blockedTaskId) => [taskId, blockedTaskId] as const),
  ];

  for (const [blockerId, blockedTaskId] of edges) {
    db.prepare(`
      INSERT OR IGNORE INTO task_dependencies (blocker_task_id, blocked_task_id)
      VALUES (?, ?)
    `).run(blockerId, blockedTaskId);
  }
}

function buildDependencyGraph(
  db: Database.Database,
  ignoreTaskId?: number,
): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();
  const taskRows = db.prepare(`SELECT id FROM tasks`).all() as Array<{ id: number }>;
  for (const row of taskRows) {
    if (ignoreTaskId === row.id) {
      continue;
    }
    graph.set(row.id, new Set());
  }

  const dependencyRows = db.prepare(`
    SELECT blocker_task_id, blocked_task_id
    FROM task_dependencies
  `).all() as TaskDependencyRow[];
  for (const row of dependencyRows) {
    if (ignoreTaskId === row.blocker_task_id || ignoreTaskId === row.blocked_task_id) {
      continue;
    }
    if (!graph.has(row.blocker_task_id)) {
      graph.set(row.blocker_task_id, new Set());
    }
    graph.get(row.blocker_task_id)?.add(row.blocked_task_id);
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

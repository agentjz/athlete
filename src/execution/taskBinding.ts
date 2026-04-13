import type { TaskRecord } from "../tasks/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";
import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";
import { TaskStore } from "../tasks/store.js";
import { WorktreeStore } from "../worktrees/store.js";

export interface PreparedExecutionTaskContext {
  cwd: string;
  task?: TaskRecord;
  worktree?: WorktreeRecord;
}

export async function prepareExecutionTaskContext(input: {
  rootDir: string;
  execution: ExecutionRecord;
}): Promise<PreparedExecutionTaskContext> {
  const { execution } = input;
  if (typeof execution.taskId !== "number") {
    return {
      cwd: execution.cwd,
    };
  }

  const taskStore = new TaskStore(input.rootDir);
  const executionStore = new ExecutionStore(input.rootDir);
  let task = await taskStore.load(execution.taskId);

  if (execution.profile === "teammate") {
    if (!task.assignee) {
      task = await taskStore.assign(task.id, execution.actorName);
    }
    task = await taskStore.claim(task.id, execution.actorName);
  } else if (task.status === "pending") {
    task = await taskStore.update(task.id, {
      status: "in_progress",
      owner: task.owner || execution.requestedBy,
    });
  }

  let cwd = execution.cwd;
  let worktree: WorktreeRecord | undefined;
  if (execution.worktreePolicy === "task") {
    worktree = await new WorktreeStore(input.rootDir).ensureForTask(task.id, task.subject);
    cwd = worktree.path;
    await executionStore.save({
      ...execution,
      cwd,
      worktreeName: worktree.name,
    });
  }

  return {
    cwd,
    task,
    worktree,
  };
}

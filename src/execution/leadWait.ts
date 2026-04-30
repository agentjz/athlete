import { loadProjectContext } from "../context/projectContext.js";
import { buildObjectiveFrame, readObjectiveTask } from "../objective/metadata.js";
import type { ObjectiveTaskSnapshot } from "../objective/types.js";
import { isLeadBlockingPolicy } from "../protocol/leadWait.js";
import { snapshotExecutionWakeSignal, waitForExecutionWakeSignalChange } from "../protocol/wakeSignal.js";
import { TaskStore } from "../tasks/store.js";
import { throwIfAborted } from "../utils/abort.js";
import { reconcileActiveExecutions } from "./reconcile.js";
import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";

export async function waitForLeadWaitExecutionsToSettle(input: {
  cwd: string;
  objectiveText?: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const context = await loadProjectContext(input.cwd);

  for (;;) {
    throwIfAborted(input.abortSignal, "Lead wait was aborted.");
    const snapshot = await snapshotExecutionWakeSignal(context.stateRootDir);
    if (!await hasActiveLeadWaitExecutions(input.cwd, input.objectiveText, context.stateRootDir)) {
      return;
    }
    await waitForExecutionWakeSignalChange({
      rootDir: context.stateRootDir,
      snapshot,
      abortSignal: input.abortSignal,
    });
  }
}

export async function hasActiveLeadWaitExecutions(
  cwd: string,
  objectiveText?: string,
  stateRootDir?: string,
): Promise<boolean> {
  const rootDir = stateRootDir ?? (await loadProjectContext(cwd)).stateRootDir;
  await reconcileActiveExecutions(rootDir);
  const [executions, tasks] = await Promise.all([
    new ExecutionStore(rootDir).listRelevant({
      requestedBy: "lead",
      statuses: ["queued", "running"],
    }),
    new TaskStore(rootDir).list(),
  ]);
  const objective = objectiveText ? buildObjectiveFrame(objectiveText) : undefined;
  const relevantTasks = objective
    ? tasks
        .map((task) => readObjectiveTask(task))
        .filter((task): task is ObjectiveTaskSnapshot => Boolean(task && task.meta.key === objective.key))
    : [];

  return executions.some((execution) =>
    isLeadBlockingPolicy(execution.waitPolicy) &&
    (!objective || isExecutionRelevantToObjective(execution, objective.key, relevantTasks)));
}

function isExecutionRelevantToObjective(
  execution: ExecutionRecord,
  objectiveKey: string,
  relevantTasks: ObjectiveTaskSnapshot[],
): boolean {
  const scope = execution.waitPolicy?.scope ?? "objective";
  if (scope === "global") {
    return true;
  }

  if (execution.objectiveKey && execution.objectiveKey === objectiveKey) {
    return true;
  }

  const relevantTaskIds = new Set(relevantTasks.map((task) => task.record.id));
  if (typeof execution.taskId === "number" && relevantTaskIds.has(execution.taskId)) {
    return true;
  }

  if (scope === "task") {
    return false;
  }

  return relevantTasks.some((task) =>
    task.meta.executionId === execution.id || task.meta.jobId === execution.id);
}

import { setTimeout as sleep } from "node:timers/promises";

import { loadProjectContext } from "../../context/projectContext.js";
import { reconcileActiveExecutions } from "../../execution/reconcile.js";
import { ExecutionStore } from "../../execution/store.js";
import type { ExecutionRecord } from "../../execution/types.js";
import { buildOrchestratorObjective, readOrchestratorTask } from "../../orchestrator/metadata.js";
import type { OrchestratorTaskSnapshot } from "../../orchestrator/types.js";
import { TaskStore } from "../../tasks/store.js";
import { throwIfAborted } from "../../utils/abort.js";

export const DEFAULT_DELEGATED_WAIT_POLL_INTERVAL_MS = 15_000;

export async function waitForDelegatedWorkToSettle(input: {
  cwd: string;
  objectiveText?: string;
  abortSignal?: AbortSignal;
  pollIntervalMs?: number;
}): Promise<void> {
  const pollIntervalMs = normalizePollInterval(input.pollIntervalMs);

  for (;;) {
    throwIfAborted(input.abortSignal, "Delegated work wait was aborted.");
    if (!await hasActiveDelegatedWork(input.cwd, input.objectiveText)) {
      return;
    }
    await sleep(pollIntervalMs, undefined, { signal: input.abortSignal });
  }
}

export async function hasActiveDelegatedWork(cwd: string, objectiveText?: string): Promise<boolean> {
  const context = await loadProjectContext(cwd);
  await reconcileActiveExecutions(context.stateRootDir);
  const [executions, tasks] = await Promise.all([
    new ExecutionStore(context.stateRootDir).listRelevant({
      requestedBy: "lead",
      statuses: ["queued", "running"],
    }),
    new TaskStore(context.stateRootDir).list(),
  ]);
  const objective = objectiveText ? buildOrchestratorObjective(objectiveText) : undefined;
  const relevantTasks = objective
    ? tasks
        .map((task) => readOrchestratorTask(task))
        .filter((task): task is OrchestratorTaskSnapshot => Boolean(task && task.meta.key === objective.key))
    : [];

  return executions.some((execution) =>
    isDelegatedExecution(execution) &&
    (!objective || isExecutionRelevantToObjective(execution, objective.key, relevantTasks)));
}

function isDelegatedExecution(execution: ExecutionRecord): boolean {
  return execution.profile === "teammate" || execution.profile === "subagent" || execution.profile === "background";
}

function isExecutionRelevantToObjective(
  execution: ExecutionRecord,
  objectiveKey: string,
  relevantTasks: OrchestratorTaskSnapshot[],
): boolean {
  if (execution.objectiveKey && execution.objectiveKey === objectiveKey) {
    return true;
  }

  const relevantTaskIds = new Set(relevantTasks.map((task) => task.record.id));
  if (typeof execution.taskId === "number" && relevantTaskIds.has(execution.taskId)) {
    return true;
  }

  return relevantTasks.some((task) =>
    task.meta.executionId === execution.id || task.meta.jobId === execution.id);
}

function normalizePollInterval(value: number | undefined): number {
  if (!Number.isFinite(value) || typeof value !== "number") {
    return DEFAULT_DELEGATED_WAIT_POLL_INTERVAL_MS;
  }

  return Math.max(1, Math.trunc(value));
}

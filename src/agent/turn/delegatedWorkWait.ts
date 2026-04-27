import { loadProjectContext } from "../../context/projectContext.js";
import { reconcileActiveExecutions } from "../../execution/reconcile.js";
import { ExecutionStore } from "../../execution/store.js";
import type { ExecutionRecord } from "../../execution/types.js";
import { buildOrchestratorObjective, readOrchestratorTask } from "../../orchestrator/metadata.js";
import type { OrchestratorTaskSnapshot } from "../../orchestrator/types.js";
import { snapshotExecutionWakeSignal, waitForExecutionWakeSignalChange } from "../../protocol/wakeSignal.js";
import { TaskStore } from "../../tasks/store.js";
import { throwIfAborted } from "../../utils/abort.js";

export async function waitForDelegatedWorkToSettle(input: {
  cwd: string;
  objectiveText?: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const context = await loadProjectContext(input.cwd);

  for (;;) {
    throwIfAborted(input.abortSignal, "Delegated work wait was aborted.");
    const snapshot = await snapshotExecutionWakeSignal(context.stateRootDir);
    if (!await hasActiveDelegatedWork(input.cwd, input.objectiveText, context.stateRootDir)) {
      return;
    }
    await waitForExecutionWakeSignalChange({
      rootDir: context.stateRootDir,
      snapshot,
      abortSignal: input.abortSignal,
    });
  }
}

export async function hasActiveDelegatedWork(
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


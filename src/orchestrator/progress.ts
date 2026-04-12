import { reconcileBackgroundJobs, BackgroundJobStore } from "../execution/background.js";
import { ExecutionStore } from "../execution/store.js";
import { CoordinationPolicyStore } from "../team/policyStore.js";
import { ProtocolRequestStore } from "../team/requestStore.js";
import { reconcileTeamState } from "../team/reconcile.js";
import { TeamStore } from "../team/store.js";
import { TaskStore } from "../tasks/store.js";
import { WorktreeStore } from "../worktrees/store.js";
import { readOrchestratorTask } from "./metadata.js";
import { deriveOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import type { OrchestratorObjective, OrchestratorProgressSnapshot, OrchestratorTaskSnapshot } from "./types.js";

const TASK_KIND_ORDER = {
  survey: 0,
  implementation: 1,
  validation: 2,
  merge: 3,
} as const;

export async function loadOrchestratorProgress(input: {
  rootDir: string;
  cwd: string;
  objective: OrchestratorObjective;
}): Promise<OrchestratorProgressSnapshot> {
  await reconcileTeamState(input.rootDir);
  await reconcileBackgroundJobs(input.rootDir);

  const taskStore = new TaskStore(input.rootDir);
  const backgroundStore = new BackgroundJobStore(input.rootDir);
  const [tasks, teammates, relevantBackgroundJobs, executions, worktrees, protocolRequests, policy] = await Promise.all([
    taskStore.list(),
    new TeamStore(input.rootDir).listMembers(),
    backgroundStore.listRelevant({
      cwd: input.cwd,
      requestedBy: "lead",
    }),
    new ExecutionStore(input.rootDir).listRelevant({
      requestedBy: "lead",
    }),
    new WorktreeStore(input.rootDir).list(),
    new ProtocolRequestStore(input.rootDir).list(),
    new CoordinationPolicyStore(input.rootDir).load(),
  ]);

  await syncSuccessfulBackgroundTasks(taskStore, tasks, relevantBackgroundJobs);
  const refreshedTasks = await taskStore.list();
  const relevantTasks = refreshedTasks
    .map((task) => readOrchestratorTask(task))
    .filter((task): task is OrchestratorTaskSnapshot => Boolean(task && task.meta.key === input.objective.key));
  const lifecycleTasks = relevantTasks
    .map((task) => ({
      ...task,
      lifecycle: deriveOrchestratorTaskLifecycle({
        task,
        teammates,
        executions,
        backgroundJobs: relevantBackgroundJobs,
        worktrees,
      }),
    }))
    .sort(compareTasks);
  const readyTasks = lifecycleTasks
    .filter((task) => task.lifecycle?.stage === "ready" && task.lifecycle.runnableBy.kind === "lead")
    .sort(compareTasks);

  return {
    rootDir: input.rootDir,
    cwd: input.cwd,
    tasks: refreshedTasks,
    relevantTasks: lifecycleTasks,
    readyTasks,
    relevantBackgroundJobs,
    runningBackgroundJobs: relevantBackgroundJobs.filter((job) => job.status === "running"),
    executions,
    activeExecutions: executions.filter((execution) => execution.status === "queued" || execution.status === "running"),
    teammates,
    idleTeammates: teammates.filter((member) => member.status === "idle"),
    workingTeammates: teammates.filter((member) => member.status === "working"),
    worktrees,
    protocolRequests,
    policy,
  };
}

async function syncSuccessfulBackgroundTasks(
  taskStore: TaskStore,
  tasks: Awaited<ReturnType<TaskStore["list"]>>,
  jobs: Awaited<ReturnType<BackgroundJobStore["listRelevant"]>>,
): Promise<void> {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  for (const task of tasks) {
    const orchestrated = readOrchestratorTask(task);
    if (!orchestrated?.meta.jobId || task.status === "completed") {
      continue;
    }

    const job = jobsById.get(orchestrated.meta.jobId);
    if (!job || job.status !== "completed" || job.exitCode !== 0) {
      continue;
    }

    await taskStore.update(task.id, {
      status: "completed",
      owner: task.owner || "lead",
    });
  }
}

function compareTasks(left: OrchestratorTaskSnapshot, right: OrchestratorTaskSnapshot): number {
  const leftOrder = TASK_KIND_ORDER[left.meta.kind] ?? 99;
  const rightOrder = TASK_KIND_ORDER[right.meta.kind] ?? 99;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.record.id - right.record.id;
}

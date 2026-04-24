import type {
  OrchestratorDecision,
  OrchestratorProgressSnapshot,
  OrchestratorTaskLifecycle,
  OrchestratorTaskPlan,
  OrchestratorTaskSnapshot,
  OrchestratorWaitState,
} from "./types.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";

export function routeOrchestratorAction(input: {
  analysis?: unknown;
  progress: OrchestratorProgressSnapshot;
  plan: OrchestratorTaskPlan;
}): OrchestratorDecision {
  const relevantTasks = input.progress.relevantTasks.length > 0
    ? input.progress.relevantTasks
    : input.plan.tasks;
  const conflictingTask = relevantTasks.find((task) => getOrchestratorTaskLifecycle(task).illegal);
  if (conflictingTask) {
    const lifecycle = getOrchestratorTaskLifecycle(conflictingTask);
    return {
      action: "self_execute",
      reason: `Task #${conflictingTask.record.id} has a control-plane conflict (${lifecycle.reasonCode}): ${lifecycle.reason}`,
      task: conflictingTask,
    };
  }

  const activeLeadTask = relevantTasks.find((task) => isActiveLeadTask(getOrchestratorTaskLifecycle(task)));
  if (activeLeadTask) {
    return {
      action: "self_execute",
      reason: `Lead must continue the active orchestration stage on Task #${activeLeadTask.record.id}.`,
      task: activeLeadTask,
    };
  }

  const readyTasks = relevantTasks.filter((task) => getOrchestratorTaskLifecycle(task).stage === "ready");
  const mergeTask = readyTasks.find((task) => task.meta.kind === "merge" && leadMayAct(task));
  if (mergeTask) {
    return {
      action: "self_execute",
      reason: `Task #${mergeTask.record.id} is the formal merge stage for the lead.`,
      task: mergeTask,
    };
  }

  const surveyTask = readyTasks.find((task) => task.meta.kind === "survey" && leadMayAct(task));
  if (surveyTask) {
    return {
      action: "self_execute",
      reason: `Task #${surveyTask.record.id} may fit a subagent survey, but the lead must decide whether to delegate, inspect directly, or choose another route.`,
      task: surveyTask,
    };
  }

  const backgroundReconcileTask = readyTasks.find((task) =>
    leadMayAct(task) && Boolean(task.meta.executionId || task.meta.jobId));
  if (backgroundReconcileTask) {
    return {
      action: "self_execute",
      reason: `Task #${backgroundReconcileTask.record.id} already has background history and must be reconciled on the lead before any relaunch.`,
      task: backgroundReconcileTask,
    };
  }

  const backgroundTask = readyTasks.find((task) =>
    leadMayAct(task) && Boolean(task.meta.backgroundCommand) && !task.meta.executionId && !task.meta.jobId);
  if (backgroundTask) {
    if (!backgroundTask.meta.backgroundCommand) {
      return {
        action: "self_execute",
        reason: `Task #${backgroundTask.record.id} is missing its background command and must be reconciled by the lead.`,
        task: backgroundTask,
      };
    }

    return {
      action: "self_execute",
      reason: `Task #${backgroundTask.record.id} may fit background execution for '${backgroundTask.meta.backgroundCommand}', but the lead must decide whether to run it in foreground, background, or choose another route.`,
      task: backgroundTask,
    };
  }

  const teammateTask = readyTasks.find((task) => task.record.assignee && leadMayAct(task));
  if (teammateTask) {
    return {
      action: "self_execute",
      reason: `Task #${teammateTask.record.id} may fit teammate or parallel work, but the lead must decide whether to delegate, do it directly, or choose another route.`,
      task: teammateTask,
    };
  }

  const delegatedWait = collectDelegatedWaitState(input.progress);
  if (hasDelegatedWait(delegatedWait)) {
    return {
      action: "wait_for_existing_work",
      reason: formatDelegatedWaitReason(delegatedWait),
      wait: delegatedWait,
    };
  }

  const leadTask = readyTasks.find((task) => task.meta.executor === "lead" && leadMayAct(task));
  if (leadTask) {
    return {
      action: "self_execute",
      reason: `Task #${leadTask.record.id} is the current lead-owned stage.`,
      task: leadTask,
    };
  }

  return {
    action: "self_execute",
    reason: "No orchestration state requires dispatch or waiting before the lead continues directly.",
  };
}

function leadMayAct(task: OrchestratorTaskSnapshot): boolean {
  return getOrchestratorTaskLifecycle(task).runnableBy.kind === "lead";
}

function isActiveLeadTask(lifecycle: OrchestratorTaskLifecycle): boolean {
  return lifecycle.stage === "active" && lifecycle.owner.kind === "lead";
}

function collectDelegatedWaitState(progress: OrchestratorProgressSnapshot): OrchestratorWaitState {
  const taskIds = new Set<number>();
  const teammateNames = new Set<string>();
  const backgroundJobIds = new Set<string>();

  for (const execution of progress.activeExecutions) {
    if (typeof execution.taskId === "number") {
      taskIds.add(execution.taskId);
    }
    if (execution.profile === "teammate") {
      teammateNames.add(execution.actorName);
      continue;
    }
    if (execution.profile === "background") {
      backgroundJobIds.add(execution.id);
    }
  }

  for (const task of progress.relevantTasks) {
    const lifecycle = getOrchestratorTaskLifecycle(task);
    if (lifecycle.stage === "completed") {
      continue;
    }
    const taskId = task.record.id;
    if (lifecycle.owner.kind === "background" || lifecycle.handoff.kind === "background") {
      taskIds.add(taskId);
      if (lifecycle.owner.name) {
        backgroundJobIds.add(lifecycle.owner.name);
      }
      if (lifecycle.handoff.jobId) {
        backgroundJobIds.add(lifecycle.handoff.jobId);
      }
      continue;
    }

    if (
      lifecycle.owner.kind === "teammate" ||
      lifecycle.runnableBy.kind === "teammate" ||
      lifecycle.handoff.kind === "teammate"
    ) {
      taskIds.add(taskId);
      if (lifecycle.owner.name) {
        teammateNames.add(lifecycle.owner.name);
      }
      if (lifecycle.runnableBy.name) {
        teammateNames.add(lifecycle.runnableBy.name);
      }
      if (lifecycle.handoff.target) {
        teammateNames.add(lifecycle.handoff.target);
      }
    }
  }

  return {
    taskIds: [...taskIds].sort((left, right) => left - right),
    teammateNames: [...teammateNames].sort((left, right) => left.localeCompare(right)),
    backgroundJobIds: [...backgroundJobIds].sort((left, right) => left.localeCompare(right)),
  };
}

function hasDelegatedWait(wait: OrchestratorWaitState): boolean {
  return wait.taskIds.length > 0 || wait.teammateNames.length > 0 || wait.backgroundJobIds.length > 0;
}

function formatDelegatedWaitReason(wait: OrchestratorWaitState): string {
  const parts: string[] = [];
  if (wait.taskIds.length > 0) {
    parts.push(`Task #${wait.taskIds.join(", #")}`);
  }
  if (wait.teammateNames.length > 0) {
    parts.push(`teammate ${wait.teammateNames.join(", ")}`);
  }
  if (wait.backgroundJobIds.length > 0) {
    parts.push(`background job ${wait.backgroundJobIds.join(", ")}`);
  }

  return parts.length > 0
    ? `Waiting for delegated work to advance: ${parts.join("; ")}.`
    : "Waiting for delegated work to advance.";
}


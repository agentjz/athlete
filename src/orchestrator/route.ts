import type { TeamMemberRecord } from "../team/types.js";
import { getOrchestratorTaskLifecycle } from "./taskLifecycle.js";
import type {
  OrchestratorAnalysis,
  OrchestratorDecision,
  OrchestratorProgressSnapshot,
  OrchestratorTaskPlan,
  OrchestratorTaskSnapshot,
} from "./types.js";

export function routeOrchestratorAction(input: {
  analysis: OrchestratorAnalysis;
  progress: OrchestratorProgressSnapshot;
  plan: OrchestratorTaskPlan;
}): OrchestratorDecision {
  const readyTasks = (input.plan.readyTasks.length > 0 ? input.plan.readyTasks : input.progress.readyTasks)
    .filter((task) => {
      const lifecycle = getOrchestratorTaskLifecycle(task);
      return lifecycle.stage === "ready" && lifecycle.runnableBy.kind === "lead";
    });
  const conflictingTask = input.progress.relevantTasks.find((task) => getOrchestratorTaskLifecycle(task).illegal);
  const surveyTask = readyTasks.find((task) => task.meta.kind === "survey");
  const implementationTask = readyTasks.find((task) => task.meta.kind === "implementation");
  const validationTask = readyTasks.find((task) => task.meta.kind === "validation");

  if (conflictingTask) {
    const lifecycle = getOrchestratorTaskLifecycle(conflictingTask);
    return {
      action: "self_execute",
      reason: `Task #${conflictingTask.record.id} has a control-plane conflict (${lifecycle.reasonCode}): ${lifecycle.reason}`,
      task: conflictingTask,
    };
  }

  if (surveyTask) {
    return {
      action: "delegate_subagent",
      reason: `Task #${surveyTask.record.id} should be surveyed before implementation.`,
      task: surveyTask,
      subagentType: "explore",
    };
  }

  if (input.analysis.wantsBackground && input.analysis.backgroundCommand) {
    const runningMatch = input.progress.runningBackgroundJobs.find((job) => job.command === input.analysis.backgroundCommand);
    if (runningMatch && !implementationTask && !validationTask) {
      return {
        action: "wait_for_existing_work",
        reason: `Background job ${runningMatch.id} is still running.`,
      };
    }

    const targetTask = [validationTask, implementationTask].find((task) => task && !task.meta.jobId);
    if (targetTask) {
      return {
        action: "run_in_background",
        reason: `Task #${targetTask.record.id} should run as background work.`,
        task: targetTask,
        backgroundCommand: input.analysis.backgroundCommand,
      };
    }
  }

  if (implementationTask && shouldDelegateToTeammate(input.analysis, input.progress, implementationTask)) {
    return {
      action: "delegate_teammate",
      reason: `Task #${implementationTask.record.id} can run in parallel.`,
      task: implementationTask,
      teammate: selectTeammateTarget(input.progress.idleTeammates, input.progress.teammates, implementationTask),
    };
  }

  if (!implementationTask && !validationTask && hasRunningDelegatedWork(input.progress)) {
    return {
      action: "wait_for_existing_work",
      reason: "Delegated work is already in progress and no ready task remains for the lead.",
    };
  }

  const focusTask = implementationTask ?? validationTask ?? readyTasks[0];
  return {
    action: "self_execute",
    reason: focusTask
      ? `Lead keeps Task #${focusTask.record.id} on the current turn.`
      : "No additional orchestration work is needed before the lead continues directly.",
    task: focusTask,
  };
}

function shouldDelegateToTeammate(
  analysis: OrchestratorAnalysis,
  progress: OrchestratorProgressSnapshot,
  task: OrchestratorTaskSnapshot,
): boolean {
  if (task.record.assignee && task.record.assignee !== "lead") {
    return true;
  }

  if (analysis.wantsTeammate) {
    return true;
  }

  return analysis.prefersParallel && analysis.complexity === "complex" && (progress.idleTeammates.length > 0 || progress.teammates.length === 0);
}

function selectTeammateTarget(
  idleTeammates: TeamMemberRecord[],
  teammates: TeamMemberRecord[],
  task: OrchestratorTaskSnapshot,
): { name: string; role: string } {
  if (task.record.assignee) {
    const existing = teammates.find((member) => member.name === task.record.assignee);
    return {
      name: task.record.assignee,
      role: existing?.role ?? "implementer",
    };
  }

  if (idleTeammates.length > 0) {
    const firstIdle = idleTeammates[0];
    if (!firstIdle) {
      return {
        name: `worker-${teammates.length + 1}`,
        role: "implementer",
      };
    }

    return {
      name: firstIdle.name,
      role: firstIdle.role,
    };
  }

  return {
    name: `worker-${teammates.length + 1}`,
    role: "implementer",
  };
}

function hasRunningDelegatedWork(progress: OrchestratorProgressSnapshot): boolean {
  if (progress.runningBackgroundJobs.length > 0 || progress.workingTeammates.length > 0) {
    return true;
  }

  return progress.relevantTasks.some((task) => {
    const lifecycle = getOrchestratorTaskLifecycle(task);
    return (
      (lifecycle.stage === "active" && (lifecycle.owner.kind === "background" || lifecycle.owner.kind === "teammate")) ||
      (lifecycle.stage === "ready" && lifecycle.runnableBy.kind === "teammate")
    );
  });
}

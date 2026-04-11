import type { TeamMemberRecord } from "../team/types.js";
import { resolveOrchestratorExecutor } from "./metadata.js";
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
  const readyTasks = (input.plan.tasks.length > 0 ? input.plan.tasks : input.progress.relevantTasks)
    .filter((task) => getOrchestratorTaskLifecycle(task).stage === "ready");
  const conflictingTask = input.progress.relevantTasks.find((task) => getOrchestratorTaskLifecycle(task).illegal);
  const mergeTask = readyTasks.find((task) => task.meta.kind === "merge");
  const surveyTask = readyTasks.find((task) => task.meta.kind === "survey" && resolveOrchestratorExecutor(task, input.analysis) === "subagent");
  const backgroundTask = readyTasks.find((task) =>
    resolveOrchestratorExecutor(task, input.analysis) === "background" && !task.meta.jobId);
  const teammateTask = readyTasks.find((task) => resolveOrchestratorExecutor(task, input.analysis) === "teammate");
  const leadTask = readyTasks.find((task) => resolveOrchestratorExecutor(task, input.analysis) === "lead");

  if (conflictingTask) {
    const lifecycle = getOrchestratorTaskLifecycle(conflictingTask);
    return {
      action: "self_execute",
      reason: `Task #${conflictingTask.record.id} has a control-plane conflict (${lifecycle.reasonCode}): ${lifecycle.reason}`,
      task: conflictingTask,
    };
  }

  if (mergeTask) {
    return {
      action: "self_execute",
      reason: `Task #${mergeTask.record.id} is the next lead merge step.`,
      task: mergeTask,
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

  if (backgroundTask) {
    const backgroundCommand = backgroundTask.meta.backgroundCommand ?? input.analysis.backgroundCommand;
    if (backgroundCommand) {
      const runningMatch = input.progress.runningBackgroundJobs.find((job) => job.command === backgroundCommand);
      if (runningMatch) {
        return {
          action: "wait_for_existing_work",
          reason: `Background job ${runningMatch.id} is still running.`,
        };
      }

      return {
        action: "run_in_background",
        reason: `Task #${backgroundTask.record.id} should run as background work.`,
        task: backgroundTask,
        backgroundCommand,
      };
    }
  }

  if (teammateTask && shouldDelegateToTeammate(input.analysis, input.progress, teammateTask)) {
    return {
      action: "delegate_teammate",
      reason: `Task #${teammateTask.record.id} can run on a teammate lane.`,
      task: teammateTask,
      teammate: selectTeammateTarget(input.progress.idleTeammates, input.progress.teammates, teammateTask),
    };
  }

  if (!leadTask && hasRunningDelegatedWork(input.progress)) {
    return {
      action: "wait_for_existing_work",
      reason: "Delegated work is already in progress and no ready task remains for the lead.",
    };
  }

  const focusTask = leadTask ?? readyTasks[0];
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

import type { BackgroundJobRecord } from "../execution/background.js";
import type { ExecutionRecord } from "../execution/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";
import type { OrchestratorTaskLifecycle, OrchestratorTaskSnapshot } from "./types.js";
import {
  buildTaskHandoff,
  buildTaskLifecycle,
  leadActor,
  subagentActor,
  teammateActor,
} from "./taskLifecycleShared.js";

export function resolveExecutionOwnedLifecycle(input: {
  task: OrchestratorTaskSnapshot;
  executions: ExecutionRecord[];
  backgroundJobs: BackgroundJobRecord[];
  worktree: WorktreeRecord | undefined;
}): OrchestratorTaskLifecycle | undefined {
  const { task, worktree } = input;
  if (task.meta.executionId) {
    const execution = input.executions.find((record) => record.id === task.meta.executionId);
    if (!execution) {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: leadActor(),
        reasonCode: "blocked.missing_execution",
        reason: `Task #${task.record.id} points to missing execution '${task.meta.executionId}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    if (execution.status === "queued" || execution.status === "running") {
      return buildTaskLifecycle({
        stage: "active",
        owner: executionOwner(execution),
        reasonCode: `active.execution_${execution.profile}`,
        reason: `Execution '${execution.id}' is actively running for Task #${task.record.id}.`,
        handoff: executionHandoff(execution),
        worktree,
      });
    }

    return buildTaskLifecycle({
      stage: "ready",
      runnableBy: leadActor(),
      owner: leadActor(),
      reasonCode: `ready.execution_${execution.status}`,
      reason: `Execution '${execution.id}' closed with status '${execution.status}', so the lead must sign off Task #${task.record.id}.`,
      handoff: executionHandoff(execution),
      worktree,
    });
  }

  if (!task.meta.jobId) {
    return undefined;
  }

  const job = input.backgroundJobs.find((entry) => entry.id === task.meta.jobId);
  if (!job) {
    return buildTaskLifecycle({
      stage: "blocked",
      owner: { kind: "background", name: task.meta.jobId },
      reasonCode: "blocked.missing_background_job",
      reason: `Task #${task.record.id} points to missing background job '${task.meta.jobId}'.`,
      illegal: true,
      handoff: buildTaskHandoff(task, false),
      worktree,
    });
  }

  if (job.status === "running") {
    return buildTaskLifecycle({
      stage: "active",
      owner: { kind: "background", name: job.id },
      reasonCode: "active.background_running",
      reason: `Background job '${job.id}' is still running for Task #${task.record.id}.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (job.status === "completed" && job.exitCode === 0) {
    return buildTaskLifecycle({
      stage: "active",
      owner: { kind: "background", name: job.id },
      reasonCode: "active.background_completed_pending_sync",
      reason: `Background job '${job.id}' finished successfully and Task #${task.record.id} is waiting for task-state sync.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  return buildTaskLifecycle({
    stage: "ready",
    runnableBy: leadActor(),
    owner: leadActor(),
    reasonCode: "ready.background_failed",
    reason: `Background job '${job.id}' ended with status '${job.status}', so the lead must reconcile Task #${task.record.id}.`,
    handoff: buildTaskHandoff(task),
    worktree,
  });
}

function executionOwner(execution: ExecutionRecord) {
  switch (execution.profile) {
    case "background":
      return { kind: "background" as const, name: execution.id };
    case "teammate":
      return teammateActor(execution.actorName);
    case "subagent":
      return subagentActor(execution.actorName);
    default:
      return leadActor();
  }
}

function executionHandoff(execution: ExecutionRecord): OrchestratorTaskLifecycle["handoff"] {
  switch (execution.profile) {
    case "background":
      return {
        kind: "background",
        jobId: execution.id,
        legal: true,
      };
    case "teammate":
      return {
        kind: "teammate",
        target: execution.actorName,
        legal: true,
      };
    case "subagent":
      return {
        kind: "subagent",
        target: execution.actorName,
        legal: true,
      };
    default:
      return {
        kind: "none",
        legal: true,
      };
  }
}

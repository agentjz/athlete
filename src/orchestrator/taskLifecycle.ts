import type { BackgroundJobRecord } from "../background/types.js";
import type { TeamMemberRecord } from "../team/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";
import type { OrchestratorTaskLifecycle, OrchestratorTaskSnapshot } from "./types.js";
import {
  buildTaskHandoff,
  buildTaskLifecycle,
  leadActor,
  normalizeActorName,
  teammateActor,
} from "./taskLifecycleShared.js";

export function deriveOrchestratorTaskLifecycle(input: {
  task: OrchestratorTaskSnapshot;
  teammates: TeamMemberRecord[];
  backgroundJobs: BackgroundJobRecord[];
  worktrees: WorktreeRecord[];
}): OrchestratorTaskLifecycle {
  const { task } = input;
  const assignedTeammate = normalizeActorName(task.record.assignee || task.meta.delegatedTo);
  const ownerName = normalizeActorName(task.record.owner);
  const teammateByName = new Map(input.teammates.map((member) => [normalizeActorName(member.name), member]));
  const worktree = task.record.worktree
    ? input.worktrees.find((item) => item.name === task.record.worktree)
    : undefined;
  const missingBoundWorktree = Boolean(task.record.worktree) && (!worktree || worktree.status === "removed");

  if (task.record.status === "completed") {
    return buildTaskLifecycle({
      stage: "completed",
      owner: { kind: "none" },
      reasonCode: "completed.done",
      reason: `Task #${task.record.id} is already completed.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (task.record.blockedBy.length > 0) {
    return buildTaskLifecycle({
      stage: "blocked",
      owner: leadActor(),
      reasonCode: "blocked.dependencies",
      reason: `Task #${task.record.id} is blocked by ${task.record.blockedBy.join(", ")}.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (missingBoundWorktree) {
    return buildTaskLifecycle({
      stage: "blocked",
      owner: ownerName && ownerName !== "lead" ? teammateActor(ownerName) : leadActor(),
      reasonCode: "blocked.removed_worktree",
      reason: `Task #${task.record.id} is still bound to removed worktree '${task.record.worktree}'.`,
      illegal: true,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (task.meta.jobId) {
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

  if (assignedTeammate) {
    const teammate = teammateByName.get(assignedTeammate);
    if (!teammate) {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(assignedTeammate),
        reasonCode: "blocked.missing_teammate",
        reason: `Task #${task.record.id} is reserved for missing teammate '${assignedTeammate}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    if (ownerName && ownerName !== assignedTeammate && ownerName !== "lead") {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(ownerName),
        reasonCode: "blocked.owner_conflict",
        reason: `Task #${task.record.id} is assigned to '${assignedTeammate}' but currently owned by '${ownerName}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    if (ownerName === assignedTeammate) {
      if (teammate.status === "shutdown") {
        return buildTaskLifecycle({
          stage: "blocked",
          owner: teammateActor(assignedTeammate),
          reasonCode: "blocked.teammate_shutdown",
          reason: `Task #${task.record.id} is still owned by shutdown teammate '${assignedTeammate}'.`,
          illegal: true,
          handoff: buildTaskHandoff(task, false),
          worktree,
        });
      }

      if (!worktree || worktree.status === "removed") {
        return buildTaskLifecycle({
          stage: "blocked",
          owner: teammateActor(assignedTeammate),
          reasonCode: "blocked.missing_worktree",
          reason: `Task #${task.record.id} is owned by teammate '${assignedTeammate}' but has no active worktree binding.`,
          illegal: true,
          handoff: buildTaskHandoff(task, false),
          worktree,
        });
      }

      return buildTaskLifecycle({
        stage: "active",
        owner: teammateActor(assignedTeammate),
        reasonCode: "active.teammate_claimed",
        reason: `Teammate '${assignedTeammate}' is actively holding Task #${task.record.id}.`,
        handoff: buildTaskHandoff(task),
        worktree,
      });
    }

    if (teammate.status === "shutdown") {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(assignedTeammate),
        reasonCode: "blocked.teammate_unavailable",
        reason: `Task #${task.record.id} is reserved for shutdown teammate '${assignedTeammate}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    return buildTaskLifecycle({
      stage: "ready",
      runnableBy: teammateActor(assignedTeammate),
      owner: teammateActor(assignedTeammate),
      reasonCode: "ready.teammate_reserved",
      reason: `Task #${task.record.id} is reserved for teammate '${assignedTeammate}'.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (ownerName && ownerName !== "lead") {
    const teammate = teammateByName.get(ownerName);
    if (!teammate) {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(ownerName),
        reasonCode: "blocked.unknown_owner",
        reason: `Task #${task.record.id} is owned by unknown teammate '${ownerName}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    if (teammate.status === "shutdown") {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(ownerName),
        reasonCode: "blocked.teammate_shutdown",
        reason: `Task #${task.record.id} is still owned by shutdown teammate '${ownerName}'.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    if (!worktree || worktree.status === "removed") {
      return buildTaskLifecycle({
        stage: "blocked",
        owner: teammateActor(ownerName),
        reasonCode: "blocked.missing_worktree",
        reason: `Task #${task.record.id} is owned by teammate '${ownerName}' but has no active worktree binding.`,
        illegal: true,
        handoff: buildTaskHandoff(task, false),
        worktree,
      });
    }

    return buildTaskLifecycle({
      stage: "active",
      owner: teammateActor(ownerName),
      reasonCode: "active.teammate_claimed",
      reason: `Teammate '${ownerName}' is actively holding Task #${task.record.id}.`,
      handoff: buildTaskHandoff(task),
      worktree,
    });
  }

  if (ownerName === "lead") {
    if (task.record.status === "in_progress") {
      return buildTaskLifecycle({
        stage: "active",
        owner: leadActor(),
        reasonCode: "active.lead",
        reason: `Lead is actively holding Task #${task.record.id}.`,
        handoff: buildTaskHandoff(task),
        worktree,
      });
    }

    return buildTaskLifecycle({
      stage: "blocked",
      owner: leadActor(),
      reasonCode: "blocked.invalid_lead_owner_state",
      reason: `Task #${task.record.id} is marked as lead-owned without an active lead execution state.`,
      illegal: true,
      handoff: buildTaskHandoff(task, false),
      worktree,
    });
  }

  if (task.record.status === "in_progress") {
    return buildTaskLifecycle({
      stage: "blocked",
      owner: leadActor(),
      reasonCode: "blocked.unowned_in_progress",
      reason: `Task #${task.record.id} is in progress without a valid owner or handoff.`,
      illegal: true,
      handoff: buildTaskHandoff(task, false),
      worktree,
    });
  }

  return buildTaskLifecycle({
    stage: "ready",
    runnableBy: leadActor(),
    owner: leadActor(),
    reasonCode: "ready.lead",
    reason: `Task #${task.record.id} is ready for the lead.`,
    handoff: buildTaskHandoff(task),
    worktree,
  });
}

export function getOrchestratorTaskLifecycle(task: OrchestratorTaskSnapshot): OrchestratorTaskLifecycle {
  return task.lifecycle ?? deriveOrchestratorTaskLifecycle({
    task,
    teammates: [],
    backgroundJobs: [],
    worktrees: [],
  });
}

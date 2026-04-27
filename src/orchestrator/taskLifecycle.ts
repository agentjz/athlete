import type { BackgroundJobRecord } from "../execution/background.js";
import type { ExecutionRecord } from "../execution/types.js";
import type { TeamMemberRecord } from "../capabilities/team/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";
import type { OrchestratorTaskLifecycle, OrchestratorTaskSnapshot } from "./types.js";
import { buildTaskHandoff, buildTaskLifecycle, leadActor, normalizeActorName, teammateActor } from "./taskLifecycleShared.js";
import { resolveExecutionOwnedLifecycle } from "./taskLifecycleExecution.js";
import { resolveTeammateOwnedLifecycle } from "./taskLifecycleTeammate.js";

export function deriveOrchestratorTaskLifecycle(input: {
  task: OrchestratorTaskSnapshot;
  teammates: TeamMemberRecord[];
  executions: ExecutionRecord[];
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

  const executionOwnedLifecycle = resolveExecutionOwnedLifecycle({
    task,
    executions: input.executions,
    backgroundJobs: input.backgroundJobs,
    worktree,
  });
  if (executionOwnedLifecycle) {
    return executionOwnedLifecycle;
  }

  const teammateOwnedLifecycle = resolveTeammateOwnedLifecycle({
    task,
    assignedTeammate,
    ownerName,
    teammateByName,
    worktree,
  });
  if (teammateOwnedLifecycle) {
    return teammateOwnedLifecycle;
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
    executions: [],
    backgroundJobs: [],
    worktrees: [],
  });
}

import type { TeamMemberRecord } from "../capabilities/team/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";
import type { OrchestratorTaskLifecycle, OrchestratorTaskSnapshot } from "./types.js";
import { buildTaskHandoff, buildTaskLifecycle, teammateActor } from "./taskLifecycleShared.js";

export function resolveTeammateOwnedLifecycle(input: {
  task: OrchestratorTaskSnapshot;
  assignedTeammate: string;
  ownerName: string;
  teammateByName: Map<string, TeamMemberRecord>;
  worktree: WorktreeRecord | undefined;
}): OrchestratorTaskLifecycle | undefined {
  const { task, assignedTeammate, ownerName, teammateByName, worktree } = input;
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

  if (!ownerName || ownerName === "lead") {
    return undefined;
  }

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

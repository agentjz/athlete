import type { WorktreeRecord } from "../worktrees/types.js";
import type { OrchestratorActorTarget, OrchestratorTaskLifecycle, OrchestratorTaskSnapshot } from "./types.js";

const NONE_ACTOR: OrchestratorActorTarget = { kind: "none" };
const LEAD_ACTOR: OrchestratorActorTarget = { kind: "lead", name: "lead" };

export function leadActor(): OrchestratorActorTarget {
  return LEAD_ACTOR;
}

export function teammateActor(name: string): OrchestratorActorTarget {
  return {
    kind: "teammate",
    name,
  };
}

export function subagentActor(name: string): OrchestratorActorTarget {
  return {
    kind: "subagent",
    name,
  };
}

export function buildTaskLifecycle(input: {
  stage: OrchestratorTaskLifecycle["stage"];
  runnableBy?: OrchestratorActorTarget;
  owner: OrchestratorActorTarget;
  handoff: OrchestratorTaskLifecycle["handoff"];
  worktree: WorktreeRecord | undefined;
  reasonCode: string;
  reason: string;
  illegal?: boolean;
}): OrchestratorTaskLifecycle {
  return {
    stage: input.stage,
    runnableBy: input.stage === "ready" ? input.runnableBy ?? LEAD_ACTOR : NONE_ACTOR,
    owner: input.owner,
    handoff: input.handoff,
    worktree: input.worktree
      ? {
          status: input.worktree.status === "removed" ? "removed" : "bound",
          name: input.worktree.name,
        }
      : {
          status: input.stage === "active" && input.owner.kind === "teammate" ? "missing" : "not_required",
          name: undefined,
        },
    reasonCode: input.reasonCode,
    reason: input.reason,
    illegal: Boolean(input.illegal),
  };
}

export function buildTaskHandoff(
  task: OrchestratorTaskSnapshot,
  legal = true,
): OrchestratorTaskLifecycle["handoff"] {
  const delegatedTo = normalizeActorName(task.record.assignee || task.meta.delegatedTo);
  if (task.meta.jobId) {
    return {
      kind: "background",
      jobId: task.meta.jobId,
      legal,
    };
  }

  if (delegatedTo) {
    return {
      kind: "teammate",
      target: delegatedTo,
      legal,
    };
  }

  return {
    kind: "none",
    legal,
  };
}

export function normalizeActorName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "-").trim();
}

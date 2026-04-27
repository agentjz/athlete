import process from "node:process";

import type { ExecutionRecord } from "../../execution/types.js";
import type { TaskRecord } from "../../tasks/types.js";
import { ExecutionStore } from "../../execution/store.js";
import type { TeamMemberRecord } from "./types.js";
import { TaskStore } from "../../tasks/store.js";
import { TeamStore } from "./store.js";

export interface TeamReconcileResult {
  staleMembers: TeamMemberRecord[];
  releasedTasks: TaskRecord[];
  closedExecutions: ExecutionRecord[];
}

export async function reconcileTeamState(rootDir: string): Promise<TeamReconcileResult> {
  const teamStore = new TeamStore(rootDir);
  const taskStore = new TaskStore(rootDir);
  const executionStore = new ExecutionStore(rootDir);
  const members = await teamStore.listMembers();
  const staleMembers: TeamMemberRecord[] = [];
  const releasedTasks: TaskRecord[] = [];
  const closedExecutions: ExecutionRecord[] = [];

  for (const member of members) {
    if (member.status === "shutdown" || typeof member.pid !== "number") {
      continue;
    }

    if (isProcessAlive(member.pid)) {
      continue;
    }

    staleMembers.push(await teamStore.updateMemberStatus(member.name, "shutdown"));
  }

  for (const member of staleMembers) {
    const runningExecutions = await executionStore.listRelevant({
      actorName: member.name,
      profile: "teammate",
      statuses: ["running"],
    });
    for (const execution of runningExecutions) {
      closedExecutions.push(
        await executionStore.close(execution.id, {
          status: "failed",
          summary: "teammate execution failed after worker exited unexpectedly",
          output: `Teammate worker '${member.name}' exited unexpectedly before reporting completion.`,
          statusDetail: "worker_exited_unexpectedly",
        }),
      );
    }
    releasedTasks.push(...(await taskStore.releaseOwner(member.name)));
  }

  return {
    staleMembers,
    releasedTasks,
    closedExecutions,
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

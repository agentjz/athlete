import process from "node:process";

import type { TaskRecord } from "../tasks/types.js";
import type { TeamMemberRecord } from "./types.js";
import { TaskStore } from "../tasks/store.js";
import { TeamStore } from "./store.js";

export interface TeamReconcileResult {
  staleMembers: TeamMemberRecord[];
  releasedTasks: TaskRecord[];
}

export async function reconcileTeamState(rootDir: string): Promise<TeamReconcileResult> {
  const teamStore = new TeamStore(rootDir);
  const taskStore = new TaskStore(rootDir);
  const members = await teamStore.listMembers();
  const staleMembers: TeamMemberRecord[] = [];
  const releasedTasks: TaskRecord[] = [];

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
    releasedTasks.push(...(await taskStore.releaseOwner(member.name)));
  }

  return {
    staleMembers,
    releasedTasks,
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

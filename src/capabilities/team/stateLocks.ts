import { TaskStore } from "../../tasks/store.js";
import type { TeamMemberRecord } from "./types.js";

export interface TeammateShutdownConflict {
  reason: string;
}

export async function getTeammateShutdownConflict(
  rootDir: string,
  member: TeamMemberRecord,
): Promise<TeammateShutdownConflict | null> {
  if (member.status === "working") {
    return {
      reason: `Teammate '${member.name}' is still marked working. Reconcile or idle the teammate before shutdown.`,
    };
  }

  const activeTask = await new TaskStore(rootDir).findOwnedActive(member.name);
  if (activeTask) {
    return {
      reason: `Task #${activeTask.id} is still owned by '${member.name}'. Reconcile, release, or complete it before shutdown.`,
    };
  }

  return null;
}

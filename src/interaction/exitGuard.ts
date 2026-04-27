import { reconcileBackgroundJobs, BackgroundJobStore } from "../execution/background.js";
import { loadProjectContext } from "../context/projectContext.js";
import { ExecutionStore } from "../execution/store.js";
import { reconcileTeamState } from "../capabilities/team/reconcile.js";
import { TeamStore } from "../capabilities/team/store.js";
import { terminateKnownProcesses } from "../utils/processControl.js";

export interface InteractiveExitProcess {
  kind: "background_job" | "teammate_worker" | "execution_worker";
  id: string;
  pid: number;
  summary: string;
}

export interface InteractiveExitTerminationResult {
  terminatedPids: number[];
  failedPids: number[];
}

export interface InteractiveExitGuard {
  collectRunningProcesses(cwd: string): Promise<InteractiveExitProcess[]>;
  terminateProcesses(processes: InteractiveExitProcess[]): Promise<InteractiveExitTerminationResult>;
}

export const defaultInteractiveExitGuard: InteractiveExitGuard = {
  collectRunningProcesses,
  terminateProcesses,
};

export async function collectRunningProcesses(cwd: string): Promise<InteractiveExitProcess[]> {
  const projectContext = await loadProjectContext(cwd);
  const rootDir = projectContext.stateRootDir;

  await Promise.all([
    reconcileBackgroundJobs(rootDir).catch(() => null),
    reconcileTeamState(rootDir).catch(() => null),
  ]);

  const [backgroundJobs, teammates] = await Promise.all([
    new BackgroundJobStore(rootDir).listRelevant({ cwd }),
    new TeamStore(rootDir).listMembers(),
  ]);
  const executions = await new ExecutionStore(rootDir).listRelevant({
    statuses: ["queued", "running"],
  });
  const seenPids = new Set<number>();
  const remember = (pid: number | undefined): boolean => {
    if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0 || seenPids.has(pid)) {
      return false;
    }

    seenPids.add(pid);
    return true;
  };

  return [
    ...backgroundJobs
      .filter((job) => job.status === "running" && remember(job.pid))
      .map((job) => ({
        kind: "background_job" as const,
        id: job.id,
        pid: job.pid as number,
        summary: `background ${job.id} pid=${job.pid} ${job.command}`,
      })),
    ...teammates
      .filter((member) => member.status !== "shutdown" && remember(member.pid))
      .map((member) => ({
        kind: "teammate_worker" as const,
        id: member.name,
        pid: member.pid as number,
        summary: `teammate ${member.name} pid=${member.pid} role=${member.role} status=${member.status}`,
      })),
    ...executions
      .filter((execution) => remember(execution.pid))
      .map((execution) => ({
        kind: "execution_worker" as const,
        id: execution.id,
        pid: execution.pid as number,
        summary: `${execution.profile} execution ${execution.id} pid=${execution.pid} actor=${execution.actorName} status=${execution.status}`,
      })),
  ];
}

export async function terminateProcesses(
  processes: InteractiveExitProcess[],
): Promise<InteractiveExitTerminationResult> {
  const terminatedPids = await terminateKnownProcesses(processes.map((process) => process.pid));
  const terminated = new Set(terminatedPids);

  return {
    terminatedPids,
    failedPids: processes.map((process) => process.pid).filter((pid) => !terminated.has(pid)),
  };
}

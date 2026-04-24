import { reconcileBackgroundJobs, BackgroundJobStore } from "../execution/background.js";
import { loadProjectContext } from "../context/projectContext.js";
import { reconcileTeamState } from "../team/reconcile.js";
import { TeamStore } from "../team/store.js";
import { terminateKnownProcesses } from "../utils/processControl.js";

export interface InteractiveExitProcess {
  kind: "background_job" | "teammate_worker";
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

  return [
    ...backgroundJobs
      .filter((job) => job.status === "running" && typeof job.pid === "number")
      .map((job) => ({
        kind: "background_job" as const,
        id: job.id,
        pid: job.pid as number,
        summary: `background ${job.id} pid=${job.pid} ${job.command}`,
      })),
    ...teammates
      .filter((member) => member.status !== "shutdown" && typeof member.pid === "number")
      .map((member) => ({
        kind: "teammate_worker" as const,
        id: member.name,
        pid: member.pid as number,
        summary: `teammate ${member.name} pid=${member.pid} role=${member.role} status=${member.status}`,
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

import process from "node:process";

import type { BackgroundJobRecord } from "./types.js";
import { BackgroundJobStore } from "./store.js";

export interface BackgroundReconcileResult {
  staleJobs: BackgroundJobRecord[];
}

export async function reconcileBackgroundJobs(rootDir: string): Promise<BackgroundReconcileResult> {
  const store = new BackgroundJobStore(rootDir);
  const jobs = await store.list();
  const staleJobs: BackgroundJobRecord[] = [];

  for (const job of jobs) {
    if (job.status !== "running" || typeof job.pid !== "number") {
      continue;
    }

    if (isProcessAlive(job.pid)) {
      continue;
    }

    staleJobs.push(
      await store.complete(job.id, {
        status: "failed",
        exitCode: job.exitCode,
        output: job.output ?? "Background worker exited unexpectedly before reporting completion.",
      }),
    );
  }

  return {
    staleJobs,
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

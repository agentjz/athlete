import process from "node:process";

import { ExecutionStore } from "./store.js";
import type { ExecutionRecord } from "./types.js";

export interface ExecutionReconcileResult {
  reconciledExecutions: ExecutionRecord[];
}

export async function reconcileActiveExecutions(rootDir: string): Promise<ExecutionReconcileResult> {
  const store = new ExecutionStore(rootDir);
  const executions = await store.listRelevant({
    statuses: ["queued", "running"],
  });
  const reconciledExecutions: ExecutionRecord[] = [];

  for (const execution of executions) {
    const reconciled = await reconcileExecution(store, execution);
    if (reconciled) {
      reconciledExecutions.push(reconciled);
    }
  }

  return {
    reconciledExecutions,
  };
}

async function reconcileExecution(
  store: ExecutionStore,
  execution: ExecutionRecord,
): Promise<ExecutionRecord | null> {
  if (execution.launch === "inline") {
    return failExecution(store, execution, {
      summary: `${execution.profile} execution failed after the host process exited unexpectedly`,
      output: `Inline ${execution.profile} execution '${execution.id}' was interrupted because the host process exited before completion.`,
      statusDetail: "host_exited_unexpectedly",
    });
  }

  if (typeof execution.pid === "number") {
    if (isProcessAlive(execution.pid)) {
      if (execution.status === "queued") {
        return store.start(execution.id, {
          pid: execution.pid,
          sessionId: execution.sessionId,
          cwd: execution.cwd,
          worktreeName: execution.worktreeName,
        });
      }

      return null;
    }

    return failExecution(store, execution, {
      summary: `${execution.profile} execution failed after worker exited unexpectedly`,
      output: `Worker-backed ${execution.profile} execution '${execution.id}' exited unexpectedly before reporting completion.`,
      statusDetail: "worker_exited_unexpectedly",
    });
  }

  return failExecution(store, execution, {
    summary: `${execution.profile} execution failed because worker launch never completed`,
    output: `Worker-backed ${execution.profile} execution '${execution.id}' never reached a live worker before the host process exited.`,
    statusDetail: "worker_never_started",
  });
}

async function failExecution(
  store: ExecutionStore,
  execution: ExecutionRecord,
  input: {
    summary: string;
    output: string;
    statusDetail: string;
  },
): Promise<ExecutionRecord> {
  const current = execution.status === "queued"
    ? await store.start(execution.id, {
      pid: execution.pid,
      sessionId: execution.sessionId,
      cwd: execution.cwd,
      worktreeName: execution.worktreeName,
    })
    : execution;

  return store.close(current.id, {
    status: "failed",
    summary: input.summary,
    output: input.output,
    statusDetail: input.statusDetail,
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

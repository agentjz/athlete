import type { SessionStoreLike } from "../agent/session/store.js";
import { ExecutionStore } from "../execution/store.js";
import { listAgentTraceSessions } from "../trace/store.js";
import type { SessionRecord } from "../types.js";

export interface RuntimeRecoveryFactSummary {
  status: "ok" | "empty" | "warning";
  latestSession?: {
    sessionId: string;
    updatedAt: string;
    cwd: string;
    messageCount: number;
    objective?: string;
    checkpointStatus?: string;
    checkpointPhase?: string;
    checkpointReason?: string;
    completedSteps: number;
    evidenceArtifacts: number;
    recentToolBatch?: {
      tools: readonly string[];
      changedPaths: readonly string[];
      recordedAt: string;
    };
    runtimeRecoveries: number;
    runtimeYields: number;
    traceEvents: number;
    activeExecutions: number;
  };
  findings: string[];
}

export async function buildRuntimeRecoveryFactSummary(input: {
  rootDir: string;
  sessionStore: SessionStoreLike;
}): Promise<RuntimeRecoveryFactSummary> {
  const findings: string[] = [];
  const session = await input.sessionStore.loadLatest().catch(() => null);
  if (!session) {
    return {
      status: "empty",
      findings: ["No persisted session found."],
    };
  }

  const traceSessions = await listAgentTraceSessions(input.rootDir);
  const trace = traceSessions.find((item) => item.sessionId === session.id);
  const executions = await new ExecutionStore(input.rootDir).list().catch(() => []);
  const activeExecutions = executions.filter((execution) =>
    execution.status === "queued" || execution.status === "running" || execution.status === "paused",
  );

  if (!session.checkpoint) {
    findings.push("Latest session has no checkpoint facts.");
  }
  if (activeExecutions.length > 0 && !session.checkpoint?.flow) {
    findings.push("Active executions exist without checkpoint flow facts.");
  }

  return {
    status: findings.length > 0 ? "warning" : "ok",
    latestSession: summarizeSession(session, {
      traceEvents: trace?.eventCount ?? 0,
      activeExecutions: activeExecutions.length,
    }),
    findings,
  };
}

function summarizeSession(
  session: SessionRecord,
  runtime: {
    traceEvents: number;
    activeExecutions: number;
  },
): NonNullable<RuntimeRecoveryFactSummary["latestSession"]> {
  return {
    sessionId: session.id,
    updatedAt: session.updatedAt,
    cwd: session.cwd,
    messageCount: session.messageCount,
    objective: session.checkpoint?.objective ?? session.taskState?.objective,
    checkpointStatus: session.checkpoint?.status,
    checkpointPhase: session.checkpoint?.flow.phase,
    checkpointReason: session.checkpoint?.flow.reason,
    completedSteps: session.checkpoint?.completedSteps.length ?? 0,
    evidenceArtifacts: session.checkpoint?.evidenceArtifacts.length ?? 0,
    recentToolBatch: session.checkpoint?.recentToolBatch
      ? {
          tools: session.checkpoint.recentToolBatch.tools,
          changedPaths: session.checkpoint.recentToolBatch.changedPaths,
          recordedAt: session.checkpoint.recentToolBatch.recordedAt,
        }
      : undefined,
    runtimeRecoveries: session.runtimeStats?.events.recoveryCount ?? 0,
    runtimeYields: session.runtimeStats?.events.yieldCount ?? 0,
    traceEvents: runtime.traceEvents,
    activeExecutions: runtime.activeExecutions,
  };
}

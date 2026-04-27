import { MessageBus } from "../capabilities/team/messageBus.js";
import { TeamStore } from "../capabilities/team/store.js";
import { recordObservabilityEvent } from "../observability/writer.js";
import { ExecutionStore } from "./store.js";
import type { ExecutionCloseInput, ExecutionRecord } from "./types.js";

export async function closeExecution(input: {
  rootDir: string;
  executionId: string;
  status: ExecutionCloseInput["status"];
  summary: string;
  resultText?: string;
  output?: string;
  exitCode?: number;
  pauseReason?: string;
  statusDetail?: string;
  notifyRequester?: boolean;
}): Promise<ExecutionRecord> {
  const store = new ExecutionStore(input.rootDir);
  const closed = await store.close(input.executionId, {
    status: input.status,
    summary: input.summary,
    resultText: input.resultText,
    output: input.output,
    exitCode: input.exitCode,
    pauseReason: input.pauseReason,
    statusDetail: input.statusDetail,
  });
  await recordObservabilityEvent(input.rootDir, {
    event: "execution.lifecycle",
    status: closed.status,
    sessionId: closed.sessionId,
    executionId: closed.id,
    identityKind: closed.profile,
    identityName: closed.actorName,
    durationMs: readExecutionDurationMs(closed),
    error: closed.status === "failed" ? {
      message: closed.summary || "execution failed",
      details: closed.output,
    } : undefined,
    details: {
      lane: closed.lane,
      profile: closed.profile,
      actorName: closed.actorName,
      actorRole: closed.actorRole,
      taskId: closed.taskId,
      worktreeName: closed.worktreeName,
      exitCode: closed.exitCode,
      statusDetail: closed.statusDetail,
    },
  });

  if (closed.profile === "teammate") {
    const teamStore = new TeamStore(input.rootDir);
    const member = await teamStore.findMember(closed.actorName).catch(() => undefined);
    if (member && member.status !== "shutdown") {
      await teamStore.updateMemberStatus(closed.actorName, "idle").catch(() => null);
    }
  }

  if (input.notifyRequester !== false && closed.launch === "worker") {
    await new MessageBus(input.rootDir).send(
      closed.actorName,
      closed.requestedBy,
      buildExecutionCloseoutText(closed),
      "execution_closeout",
      {
        executionId: closed.id,
        executionStatus: closed.status,
        executionProfile: closed.profile,
        taskId: closed.taskId,
      },
    );
  }

  return closed;
}

function buildExecutionCloseoutText(execution: ExecutionRecord): string {
  const header = `[execution:${execution.id}] ${execution.profile} ${execution.status}: ${execution.summary}`;
  const body = execution.resultText || execution.output;
  return body ? `${header}\n${body}` : header;
}

function readExecutionDurationMs(execution: ExecutionRecord): number | undefined {
  const startedAt = Date.parse(execution.createdAt);
  const endedAt = Date.parse(execution.finishedAt ?? execution.updatedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return undefined;
  }

  return Math.round(endedAt - startedAt);
}

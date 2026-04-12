import { MessageBus } from "../team/messageBus.js";
import { TeamStore } from "../team/store.js";
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

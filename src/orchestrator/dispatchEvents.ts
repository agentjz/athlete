import type { AgentCallbacks } from "../agent/types.js";
import type { ExecutionRecord } from "../execution/types.js";

export function emitSubagentDispatch(input: {
  callbacks?: AgentCallbacks;
  execution: ExecutionRecord;
  taskId: number;
  pid?: number;
  subagentType?: "explore" | "plan" | "code";
}): void {
  input.callbacks?.onDispatch?.({
    profile: "subagent",
    actorName: input.execution.actorName,
    executionId: input.execution.id,
    taskId: input.taskId,
    pid: input.pid,
    summary: `type=${input.execution.actorRole ?? input.subagentType ?? "explore"}`,
  });
}

export function emitTeammateDispatch(input: {
  callbacks?: AgentCallbacks;
  actorName: string;
  role: string;
  executionId: string;
  taskId: number;
  pid?: number;
}): void {
  input.callbacks?.onDispatch?.({
    profile: "teammate",
    actorName: input.actorName,
    executionId: input.executionId,
    taskId: input.taskId,
    pid: input.pid,
    summary: `role=${input.role}`,
  });
}

export function emitBackgroundDispatch(input: {
  callbacks?: AgentCallbacks;
  jobId: string;
  taskId?: number;
  pid?: number;
  command: string;
}): void {
  input.callbacks?.onDispatch?.({
    profile: "background",
    actorName: `bg-${input.jobId}`,
    executionId: input.jobId,
    taskId: input.taskId,
    pid: input.pid,
    summary: input.command,
  });
}

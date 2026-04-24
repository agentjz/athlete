import type { ToolExecutionProcessEvent, ToolExecutionProcessMetadata, ToolExecutionMetadata } from "../types.js";
import type { BackgroundJobStatus } from "./background.js";

export function buildForegroundProcessProtocol(input: {
  sessionId: string;
  runtimeStatus: NonNullable<ToolExecutionMetadata["runtime"]>["status"];
  exitCode: number | null;
}): ToolExecutionProcessMetadata {
  return {
    protocol: "deadmouse.exec.v1",
    processId: `foreground:${input.sessionId}`,
    lane: "foreground",
    state: readForegroundState(input.runtimeStatus),
    events: readForegroundEvents(input.runtimeStatus),
    capabilities: {
      read: false,
      write: false,
      terminate: false,
    },
    exitCode: input.exitCode,
    statusDetail: input.runtimeStatus,
  };
}

export function buildBackgroundProcessProtocol(input: {
  jobId: string;
  status: BackgroundJobStatus;
  event: "process/start" | "process/read" | "process/terminate";
  exitCode?: number;
}): ToolExecutionProcessMetadata {
  const terminal = input.status !== "running";
  const events: ToolExecutionProcessEvent[] = [input.event];
  if (terminal) {
    events.push("process/exited", "process/closed");
  }

  return {
    protocol: "deadmouse.exec.v1",
    processId: input.jobId,
    lane: "background",
    state: terminal ? "closed" : "running",
    events,
    capabilities: {
      read: true,
      write: false,
      terminate: !terminal,
    },
    exitCode: typeof input.exitCode === "number" ? input.exitCode : null,
    statusDetail: input.status,
  };
}

function readForegroundState(
  status: NonNullable<ToolExecutionMetadata["runtime"]>["status"],
): ToolExecutionProcessMetadata["state"] {
  if (status === "completed" || status === "failed" || status === "timed_out" || status === "stalled" || status === "aborted") {
    return "closed";
  }

  return "exited";
}

function readForegroundEvents(
  status: NonNullable<ToolExecutionMetadata["runtime"]>["status"],
): ToolExecutionProcessMetadata["events"] {
  if (status === "completed" || status === "failed" || status === "timed_out" || status === "stalled" || status === "aborted") {
    return ["process/start", "process/output", "process/exited", "process/closed"];
  }

  return ["process/start", "process/output", "process/exited"];
}

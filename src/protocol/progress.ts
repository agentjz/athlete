export const PROGRESS_PROTOCOL = "deadmouse.progress.v1" as const;

export type ProgressEventType = "started" | "progress" | "artifact" | "warning" | "blocked" | "heartbeat";

export interface ProgressEvent {
  protocol: typeof PROGRESS_PROTOCOL;
  executionId: string;
  eventType: ProgressEventType;
  message: string;
  artifactRefs: readonly string[];
  createdAt: string;
}

export function createProgressEvent(input: {
  executionId: string;
  eventType: ProgressEventType;
  message: string;
  artifactRefs?: readonly string[];
  createdAt?: string;
}): ProgressEvent {
  return {
    protocol: PROGRESS_PROTOCOL,
    executionId: input.executionId,
    eventType: input.eventType,
    message: input.message.trim(),
    artifactRefs: [...(input.artifactRefs ?? [])],
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

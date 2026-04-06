export type BackgroundJobStatus = "running" | "completed" | "failed" | "timed_out";

export interface BackgroundJobRecord {
  id: string;
  command: string;
  cwd: string;
  requestedBy: string;
  status: BackgroundJobStatus;
  timeoutMs: number;
  stallTimeoutMs?: number;
  pid?: number;
  exitCode?: number;
  output?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

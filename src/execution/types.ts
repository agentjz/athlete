export type ExecutionLane = "agent" | "command";

export type ExecutionProfile = "subagent" | "teammate" | "background";

export type ExecutionLaunchMode = "worker";

export type ExecutionWorktreePolicy = "none" | "task";

export type ExecutionStatus = "queued" | "running" | "paused" | "completed" | "failed" | "aborted";

export type ExecutionCloseStatus = Exclude<ExecutionStatus, "queued" | "running">;

export interface ExecutionBoundaryProtocol {
  protocol: "deadmouse.execution-boundary.v1";
  returnTo: "lead";
  onBoundary: "return_to_lead_review";
  maxRuntimeMs: number;
  maxIdleMs: number;
}

export interface ExecutionRecord {
  id: string;
  lane: ExecutionLane;
  profile: ExecutionProfile;
  launch: ExecutionLaunchMode;
  requestedBy: string;
  actorName: string;
  actorRole?: string;
  taskId?: number;
  objectiveKey?: string;
  objectiveText?: string;
  cwd: string;
  status: ExecutionStatus;
  worktreePolicy: ExecutionWorktreePolicy;
  worktreeName?: string;
  sessionId?: string;
  pid?: number;
  prompt?: string;
  command?: string;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  boundary: ExecutionBoundaryProtocol;
  summary?: string;
  resultText?: string;
  output?: string;
  exitCode?: number;
  pauseReason?: string;
  statusDetail?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface ExecutionStartInput {
  pid?: number;
  sessionId?: string;
  cwd?: string;
  worktreeName?: string;
}

export interface ExecutionCloseInput {
  status: ExecutionCloseStatus;
  summary: string;
  resultText?: string;
  output?: string;
  exitCode?: number;
  pauseReason?: string;
  statusDetail?: string;
}

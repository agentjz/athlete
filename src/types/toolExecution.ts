import type { SessionDiffChange } from "./session.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";

export interface VerificationAttempt {
  attempted: boolean;
  command: string;
  exitCode: number | null;
  kind?: string;
  passed?: boolean;
}

export type ToolExecutionProtocolPolicy = "sequential" | "parallel";

export type ToolExecutionProtocolPhase = "prepare" | "execute" | "finalize";

export interface ToolExecutionProtocolMetadata {
  policy: ToolExecutionProtocolPolicy;
  phases: ToolExecutionProtocolPhase[];
  status: "completed" | "blocked" | "failed";
  blockedIn?: ToolExecutionProtocolPhase;
  guardCode?: string;
  argumentStrictness?: {
    tier: "L0" | "L1" | "L2";
    unknownArgsStripped: string[];
    warning: boolean;
  };
}

export type ToolExecutionProcessLane = "foreground" | "background";

export type ToolExecutionProcessState = "running" | "exited" | "closed";

export type ToolExecutionProcessEvent =
  | "process/start"
  | "process/read"
  | "process/write"
  | "process/terminate"
  | "process/output"
  | "process/exited"
  | "process/closed";

export interface ToolExecutionProcessMetadata {
  protocol: "kitty.exec";
  processId: string;
  lane: ToolExecutionProcessLane;
  state: ToolExecutionProcessState;
  events: ToolExecutionProcessEvent[];
  capabilities: {
    read: boolean;
    write: boolean;
    terminate: boolean;
  };
  exitCode?: number | null;
  statusDetail?: string;
}

export interface ToolExecutionCollaborationMetadata {
  action: "spawn" | "send_message" | "read_inbox" | "close_execution";
  actor?: string;
  from?: string;
  to?: string;
  executionId?: string;
  taskId?: number;
  yieldLeadUntilCloseout?: boolean;
}

export interface ToolExecutionMetadata {
  changedPaths?: string[];
  changeId?: string;
  verification?: VerificationAttempt;
  protocol?: ToolExecutionProtocolMetadata;
  process?: ToolExecutionProcessMetadata;
  collaboration?: ToolExecutionCollaborationMetadata;
  runtime?: {
    status: "completed" | "failed" | "timed_out" | "stalled" | "aborted";
    exitCode: number | null;
    durationMs: number;
    attempts: number;
    timedOut: boolean;
    stalled: boolean;
    aborted: boolean;
    truncated: boolean;
    outputPath?: string;
    outputPreview: string;
  };
  diff?: string;
  diagnostics?: ToolDiagnosticsReport;
  sessionDiff?: SessionDiffChange;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  metadata?: ToolExecutionMetadata;
}

import type { SessionDiffChange } from "./session.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";

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

export interface ToolExecutionMetadata {
  changedPaths?: string[];
  changeId?: string;
  protocol?: ToolExecutionProtocolMetadata;
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

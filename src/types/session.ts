import type { AcceptanceState } from "./acceptance.js";
import type { RuntimeTransition } from "./runtimeTransitions.js";
import type { ToolExecutionProtocolPolicy } from "./toolExecution.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";

export interface ToolCallRecord {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StoredMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRecord[];
  reasoningContent?: string;
  externalizedToolResult?: ExternalizedToolResultReference;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  title?: string;
  messageCount: number;
  messages: StoredMessage[];
  todoItems?: TodoItem[];
  taskState?: TaskState;
  checkpoint?: SessionCheckpoint;
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  runtimeStats?: SessionRuntimeStats;
  sessionDiff?: SessionDiffState;
}

export interface SessionRuntimeUsageStats {
  requestsWithUsage: number;
  requestsWithoutUsage: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  totalTokensTotal: number;
  reasoningTokensTotal: number;
}

export interface SessionRuntimeToolStats {
  callCount: number;
  durationMsTotal: number;
  okCount: number;
  errorCount: number;
}

export interface SessionRuntimeStats {
  version: 1;
  model: {
    requestCount: number;
    waitDurationMsTotal: number;
    usage: SessionRuntimeUsageStats;
  };
  tools: {
    callCount: number;
    durationMsTotal: number;
    byName: Record<string, SessionRuntimeToolStats>;
  };
  events: {
    continuationCount: number;
    yieldCount: number;
    recoveryCount: number;
    compressionCount: number;
  };
  externalizedToolResults: {
    count: number;
    byteLengthTotal: number;
  };
  updatedAt: string;
}

export interface SessionDiffChange {
  toolName: string;
  changeId?: string;
  changedPaths: string[];
  diff?: string;
  diagnosticsStatus: ToolDiagnosticsReport["status"];
  errorCount: number;
  warningCount: number;
  recordedAt: string;
}

export interface SessionDiffState {
  version: 1;
  changedPaths: string[];
  changes: SessionDiffChange[];
  updatedAt: string;
}

export type SessionCheckpointStatus = "active" | "completed";
export type SessionCheckpointPhase = "active" | "continuation" | "resume" | "recovery";

export type SessionCheckpointArtifactKind =
  | "externalized_tool_result"
  | "tool_preview";

export interface SessionCheckpointArtifact {
  kind: SessionCheckpointArtifactKind;
  label: string;
  toolName?: string;
  path?: string;
  storagePath?: string;
  preview?: string;
  summary?: string;
  sha256?: string;
}

export interface SessionCheckpointToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  artifacts: SessionCheckpointArtifact[];
  recordedAt: string;
}

export interface PendingToolCall {
  id: string;
  name: string;
  policy: ToolExecutionProtocolPolicy;
  preparedAt: string;
}

export type SessionRunStateStatus = "busy" | "idle";

export type SessionRunStateSource = "turn" | "tool_batch" | "checkpoint";

export interface SessionRunState {
  status: SessionRunStateStatus;
  source: SessionRunStateSource;
  pendingToolCallCount: number;
  updatedAt: string;
}

export interface CompactionRecoveryState {
  active: boolean;
  compressedSince: string;
  noTextStreak: number;
  recoveryAttempts: number;
  lastRecoveryAt?: string;
  pausedAt?: string;
}

export interface SessionCheckpointFlow {
  phase: SessionCheckpointPhase;
  reason?: string;
  recoveryFailures?: number;
  runState?: SessionRunState;
  pendingToolCalls?: PendingToolCall[];
  compactionRecovery?: CompactionRecoveryState;
  lastTransition?: RuntimeTransition;
  updatedAt: string;
}

export interface SessionCheckpoint {
  version: 1;
  objective?: string;
  objectiveFingerprint?: string;
  status: SessionCheckpointStatus;
  completedSteps: string[];
  recentToolBatch?: SessionCheckpointToolBatch;
  flow: SessionCheckpointFlow;
  evidenceArtifacts: SessionCheckpointArtifact[];
  updatedAt: string;
}

export interface ExternalizedToolResultReference {
  scope: "project_state_root";
  storagePath: string;
  byteLength: number;
  charLength: number;
  preview: string;
  sha256: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface TaskState {
  objective?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  lastUpdatedAt: string;
}

export type VerificationStatus = "idle" | "passed" | "failed";

export interface VerificationState {
  status: VerificationStatus;
  attempts: number;
  observedPaths: string[];
  lastCommand?: string;
  lastKind?: string;
  lastExitCode?: number | null;
  updatedAt: string;
}

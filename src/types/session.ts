import type { RuntimeTransition } from "./runtimeTransitions.js";
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
  sessionDiff?: SessionDiffState;
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
export type SessionCheckpointPhase = "active" | "recovery";

export interface SessionCheckpointToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export type SessionRunStateStatus = "busy" | "idle";

export type SessionRunStateSource = "turn" | "tool_batch" | "checkpoint";

export interface SessionRunState {
  status: SessionRunStateStatus;
  source: SessionRunStateSource;
  pendingToolCallCount: number;
  updatedAt: string;
}

export interface SessionCheckpointFlow {
  phase: SessionCheckpointPhase;
  reason?: string;
  recoveryFailures?: number;
  runState?: SessionRunState;
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
  updatedAt: string;
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

import type {
  AcceptanceState,
  AcceptanceContractKind,
  SessionCheckpointArtifact,
  TodoStatus,
  VerificationStatus,
} from "../../../types.js";

export interface WorkingMemoryTodo {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface WorkingMemoryRecentToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export interface WorkingMemoryVerification {
  status: VerificationStatus;
  attempts: number;
  observedPaths: string[];
  lastCommand?: string;
  lastKind?: string;
  lastExitCode?: number | null;
}

export interface WorkingMemoryAcceptance {
  kind: AcceptanceContractKind;
  phase?: string;
  status: AcceptanceState["status"];
  pendingChecks: string[];
  lastIssueSummary?: string;
}

export interface AgentWorkingMemory {
  version: 1;
  objective?: string;
  objectiveFingerprint?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  todos: WorkingMemoryTodo[];
  recentToolBatch?: WorkingMemoryRecentToolBatch;
  evidenceArtifacts: SessionCheckpointArtifact[];
  verification?: WorkingMemoryVerification;
  acceptance?: WorkingMemoryAcceptance;
  checkpointPhase?: string;
  checkpointStatus?: string;
  updatedAt: string;
}

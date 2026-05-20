export interface WorkingMemoryRecentToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export interface WorkingMemoryTodo {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
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
  checkpointPhase?: string;
  checkpointStatus?: string;
  updatedAt: string;
}

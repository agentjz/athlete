export interface WorkingMemoryRecentToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export interface AgentWorkingMemory {
  version: 1;
  objective?: string;
  objectiveFingerprint?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  recentToolBatch?: WorkingMemoryRecentToolBatch;
  checkpointPhase?: string;
  checkpointStatus?: string;
  updatedAt: string;
}

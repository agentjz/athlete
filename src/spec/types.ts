export type SpecStage =
  | "requirements"
  | "design"
  | "tasks"
  | "implement"
  | "validate"
  | "archive";

export type SpecStatus =
  | "active"
  | "paused"
  | "archived"
  | "abandoned";

export type SpecDocumentName =
  | "requirements"
  | "design"
  | "tasks"
  | "notes";

export type SpecTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";

export interface SpecTaskRecord {
  id: string;
  title?: string;
  status: SpecTaskStatus;
  evidence?: string;
  updatedAt: string;
}

export interface SpecCheckpointRecord {
  id: string;
  label: string;
  reason?: string;
  createdAt: string;
  stage: SpecStage;
  status: SpecStatus;
  workspace?: SpecWorkspaceCheckpoint;
}

export interface SpecWorkspaceRef {
  name: string;
  path: string;
  branch: string;
}

export interface SpecWorkspaceCheckpoint {
  path: string;
  branch: string;
  commit: string;
  dirtyBeforeCommit: boolean;
}

export interface SpecState {
  schemaVersion: 1;
  id: string;
  title: string;
  summary?: string;
  stage: SpecStage;
  status: SpecStatus;
  createdAt: string;
  updatedAt: string;
  sessionIds: string[];
  confirmed: {
    requirements: boolean;
    design: boolean;
    tasks: boolean;
  };
  tasks: Record<string, SpecTaskRecord>;
  workspace?: SpecWorkspaceRef;
  currentCheckpointId?: string;
  metadata: Record<string, unknown>;
}

export interface SpecSessionBinding {
  schemaVersion: 1;
  sessionId: string;
  specId: string;
  updatedAt: string;
}

export interface SpecSummary {
  id: string;
  title: string;
  summary?: string;
  stage: SpecStage;
  status: SpecStatus;
  updatedAt: string;
  workspace?: SpecWorkspaceRef;
  currentCheckpointId?: string;
}

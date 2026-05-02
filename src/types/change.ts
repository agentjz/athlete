export interface ChangeOperationRecord {
  path: string;
  kind: "create" | "update" | "delete";
  binary: boolean;
  beforeBytes?: number;
  afterBytes?: number;
  beforeSnapshotPath?: string;
  afterSnapshotPath?: string;
  preview?: string;
}

export interface ChangeRecord {
  id: string;
  createdAt: string;
  sessionId?: string;
  cwd: string;
  toolName: string;
  summary: string;
  preview?: string;
  operations: ChangeOperationRecord[];
  undoneAt?: string;
}

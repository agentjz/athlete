export type WorktreeStatus = "active" | "kept" | "removed";

export interface WorktreeRecord {
  name: string;
  path: string;
  branch: string;
  status: WorktreeStatus;
  taskId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeIndexRecord {
  items: WorktreeRecord[];
}

export interface WorktreeEventRecord {
  event: string;
  ts: number;
  task?: {
    id: number;
    status?: string;
    worktree?: string;
  };
  worktree?: {
    name: string;
    status?: WorktreeStatus;
    path?: string;
    branch?: string;
  };
  error?: string;
}

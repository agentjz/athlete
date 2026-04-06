import type { TodoItem } from "../types.js";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskRecord {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  blockedBy: number[];
  blocks: number[];
  checklist?: TodoItem[];
  assignee: string;
  owner: string;
  worktree: string;
  createdAt: string;
  updatedAt: string;
}

import type { TaskRecord } from "../tasks/types.js";

export type ObjectiveTaskKind = "survey" | "implementation" | "validation" | "merge";
export type ObjectiveExecutionKind = "lead" | "subagent" | "teammate" | "background";

export interface ObjectiveFrame {
  key: string;
  text: string;
}

export interface ObjectiveTaskMetadata {
  key: string;
  kind: ObjectiveTaskKind;
  objective: string;
  executor?: ObjectiveExecutionKind;
  backgroundCommand?: string;
  delegatedTo?: string;
  jobId?: string;
  executionId?: string;
}

export interface ObjectiveTaskSnapshot {
  record: TaskRecord;
  meta: ObjectiveTaskMetadata;
}

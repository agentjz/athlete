import type { TaskRecord } from "../tasks/types.js";

export type OrchestratorTaskKind = "survey" | "implementation" | "validation" | "merge";
export type OrchestratorExecutorKind = "lead" | "subagent" | "teammate" | "background";

export interface OrchestratorObjective {
  key: string;
  text: string;
}

export interface OrchestratorTaskMeta {
  key: string;
  kind: OrchestratorTaskKind;
  objective: string;
  executor?: OrchestratorExecutorKind;
  backgroundCommand?: string;
  delegatedTo?: string;
  jobId?: string;
  executionId?: string;
}

export interface OrchestratorTaskSnapshot {
  record: TaskRecord;
  meta: OrchestratorTaskMeta;
}

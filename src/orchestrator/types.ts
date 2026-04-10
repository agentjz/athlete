import type { SessionStoreLike } from "../agent/session.js";
import type { AgentCallbacks } from "../agent/types.js";
import type { BackgroundJobRecord } from "../background/types.js";
import type { RunSubagentTaskResult } from "../subagent/run.js";
import type { CoordinationPolicyRecord, ProtocolRequestRecord, TeamMemberRecord } from "../team/types.js";
import type { ToolRegistryFactory } from "../tools/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { TaskRecord } from "../tasks/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";

export type OrchestratorComplexity = "simple" | "moderate" | "complex";
export type OrchestratorTaskKind = "survey" | "implementation" | "validation";
export type OrchestratorAction =
  | "self_execute"
  | "delegate_subagent"
  | "delegate_teammate"
  | "run_in_background"
  | "wait_for_existing_work";

export interface OrchestratorObjective {
  key: string;
  text: string;
}

export interface OrchestratorTaskMeta {
  key: string;
  kind: OrchestratorTaskKind;
  objective: string;
  backgroundCommand?: string;
  delegatedTo?: string;
  jobId?: string;
}

export type OrchestratorActorKind = "lead" | "teammate" | "background" | "subagent" | "none";

export interface OrchestratorActorTarget {
  kind: OrchestratorActorKind;
  name?: string;
}

export type OrchestratorTaskStage = "blocked" | "ready" | "active" | "completed";

export interface OrchestratorTaskLifecycle {
  stage: OrchestratorTaskStage;
  runnableBy: OrchestratorActorTarget;
  owner: OrchestratorActorTarget;
  handoff: {
    kind: "none" | "teammate" | "background" | "subagent";
    target?: string;
    jobId?: string;
    legal: boolean;
  };
  worktree: {
    status: "not_required" | "bound" | "missing" | "removed";
    name?: string;
  };
  reasonCode: string;
  reason: string;
  illegal: boolean;
}

export interface OrchestratorTaskSnapshot {
  record: TaskRecord;
  meta: OrchestratorTaskMeta;
  lifecycle?: OrchestratorTaskLifecycle;
}

export interface OrchestratorAnalysis {
  objective: OrchestratorObjective;
  complexity: OrchestratorComplexity;
  needsInvestigation: boolean;
  prefersParallel: boolean;
  wantsBackground: boolean;
  wantsSubagent: boolean;
  wantsTeammate: boolean;
  backgroundCommand?: string;
}

export interface OrchestratorProgressSnapshot {
  rootDir: string;
  cwd: string;
  tasks: TaskRecord[];
  relevantTasks: OrchestratorTaskSnapshot[];
  readyTasks: OrchestratorTaskSnapshot[];
  relevantBackgroundJobs: BackgroundJobRecord[];
  runningBackgroundJobs: BackgroundJobRecord[];
  teammates: TeamMemberRecord[];
  idleTeammates: TeamMemberRecord[];
  workingTeammates: TeamMemberRecord[];
  worktrees: WorktreeRecord[];
  protocolRequests: ProtocolRequestRecord[];
  policy: CoordinationPolicyRecord;
}

export interface OrchestratorTaskPlan {
  objective: OrchestratorObjective;
  createdTaskIds: number[];
  tasks: OrchestratorTaskSnapshot[];
  readyTasks: OrchestratorTaskSnapshot[];
}

export interface OrchestratorTeammateTarget {
  name: string;
  role: string;
}

export interface OrchestratorDecision {
  action: OrchestratorAction;
  reason: string;
  task?: OrchestratorTaskSnapshot;
  teammate?: OrchestratorTeammateTarget;
  backgroundCommand?: string;
  subagentType?: "explore" | "plan" | "code";
}

export interface OrchestratorDispatchDependencies {
  runSubagentTask?: (input: OrchestratorSubagentInput) => Promise<RunSubagentTaskResult>;
  spawnTeammateProcess?: (input: {
    rootDir: string;
    config: RuntimeConfig;
    name: string;
    role: string;
    prompt: string;
  }) => number;
  spawnBackgroundProcess?: (input: {
    rootDir: string;
    jobId: string;
  }) => number;
}

export interface OrchestratorSubagentInput {
  description: string;
  prompt: string;
  agentType: string;
  cwd: string;
  config: RuntimeConfig;
  callbacks?: AgentCallbacks;
  createToolRegistry?: ToolRegistryFactory;
}

export interface PreparedLeadTurn {
  session: SessionRecord;
  analysis: OrchestratorAnalysis;
  progress: OrchestratorProgressSnapshot;
  plan: OrchestratorTaskPlan;
  decision: OrchestratorDecision;
}

export interface PrepareLeadTurnOptions {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  callbacks?: AgentCallbacks;
  deps?: OrchestratorDispatchDependencies;
}

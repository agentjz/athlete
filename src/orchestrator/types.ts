import type { SessionStoreLike } from "../agent/session.js";
import type { BackgroundJobRecord } from "../execution/background.js";
import type { ExecutionRecord } from "../execution/types.js";
import type { AgentCallbacks } from "../agent/types.js";
import type { DelegationDirective } from "../agent/session.js";
import type { CoordinationPolicyRecord, ProtocolRequestRecord, TeamMemberRecord } from "../capabilities/team/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { TaskRecord } from "../tasks/types.js";
import type { WorktreeRecord } from "../worktrees/types.js";

export type OrchestratorComplexity = "simple" | "moderate" | "complex";
export type OrchestratorTaskKind = "survey" | "implementation" | "validation" | "merge";
export type OrchestratorExecutorKind = "lead" | "subagent" | "teammate" | "background";
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
  executor?: OrchestratorExecutorKind;
  backgroundCommand?: string;
  delegatedTo?: string;
  jobId?: string;
  executionId?: string;
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
  delegationDirective?: DelegationDirective;
  complexity: OrchestratorComplexity;
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
  executions: ExecutionRecord[];
  activeExecutions: ExecutionRecord[];
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

export interface OrchestratorWaitState {
  taskIds: number[];
  teammateNames: string[];
  backgroundJobIds: string[];
}

export interface OrchestratorDecision {
  action: OrchestratorAction;
  reason: string;
  task?: OrchestratorTaskSnapshot;
  teammate?: OrchestratorTeammateTarget;
  wait?: OrchestratorWaitState;
  backgroundCommand?: string;
  subagentType?: "explore" | "plan" | "code";
}

export interface OrchestratorDispatchDependencies {
  spawnExecutionWorker?: (input: {
    rootDir: string;
    config: RuntimeConfig;
    executionId: string;
    actorName?: string;
  }) => number;
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

export interface RuntimeContinueResumeReason {
  code: "continue.resume_from_checkpoint";
  source: "managed_continuation" | "resume_directive";
}

export interface RuntimeContinueToolBatchReason {
  code: "continue.after_tool_batch";
  toolNames: string[];
  changedPaths: string[];
}

export interface RuntimeContinueMissingSkillsReason {
  code: "continue.required_skill_load";
  missingSkills: string[];
}

export interface RuntimeContinueIncompleteTodosReason {
  code: "continue.incomplete_todos";
  incompleteTodoCount: number;
}

export interface RuntimeContinueEmptyAssistantResponseReason {
  code: "continue.empty_assistant_response";
}

export interface RuntimeContinueVerificationRequiredReason {
  code: "continue.verification_required";
  pendingPaths: string[];
  attempts: number;
  reminderCount: number;
}

export interface RuntimeContinueVerificationFailedReason {
  code: "continue.verification_failed";
  attempts: number;
  noProgressCount: number;
  lastCommand?: string;
  lastKind?: string;
  lastExitCode?: number | null;
}

export interface RuntimeContinueAcceptanceRequiredReason {
  code: "continue.acceptance_required";
  phase: string;
  pendingChecks: string[];
  stalledPhaseCount: number;
}

export interface RuntimeRecoverProviderRequestReason {
  code: "recover.provider_request_retry";
  consecutiveFailures: number;
  error: string;
  configuredModel: string;
  requestModel: string;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  delayMs: number;
}

export interface RuntimeRecoverPostCompactionDegradationReason {
  code: "recover.post_compaction_degradation";
  consecutiveFailures: number;
  noTextStreak: number;
  recoveryAttempt: number;
  maxRecoveryAttempts: number;
}

export interface RuntimeYieldToolStepLimitReason {
  code: "yield.tool_step_limit";
  toolSteps: number;
  limit?: number;
}

export interface RuntimePauseVerificationAwaitingUserReason {
  code: "pause.verification_awaiting_user";
  pendingPaths: string[];
  pauseReason: string;
  attempts: number;
  reminderCount: number;
  noProgressCount: number;
}

export interface RuntimePauseProviderRecoveryBudgetExhaustedReason {
  code: "pause.provider_recovery_budget_exhausted";
  pauseReason: string;
  attemptsUsed: number;
  maxAttempts: number;
  elapsedMs: number;
  maxElapsedMs: number;
  lastError: string;
}

export interface RuntimePauseManagedSliceBudgetExhaustedReason {
  code: "pause.managed_slice_budget_exhausted";
  pauseReason: string;
  slicesUsed: number;
  maxSlices: number;
  elapsedMs: number;
  maxElapsedMs?: number;
}

export interface RuntimePauseDegradationRecoveryExhaustedReason {
  code: "pause.degradation_recovery_exhausted";
  pauseReason: string;
  noTextStreak: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
}

export interface RuntimeFinalizeCompletedReason {
  code: "finalize.completed";
  changedPaths: string[];
  verificationOutcome: "not_required" | "passed";
  verificationKind?: string;
}

export type RuntimeContinueReason =
  | RuntimeContinueResumeReason
  | RuntimeContinueToolBatchReason
  | RuntimeContinueMissingSkillsReason
  | RuntimeContinueIncompleteTodosReason
  | RuntimeContinueEmptyAssistantResponseReason
  | RuntimeContinueVerificationRequiredReason
  | RuntimeContinueVerificationFailedReason
  | RuntimeContinueAcceptanceRequiredReason;

export type RuntimeRecoverReason =
  | RuntimeRecoverProviderRequestReason
  | RuntimeRecoverPostCompactionDegradationReason;

export type RuntimeYieldReason = RuntimeYieldToolStepLimitReason;

export type RuntimePauseReason =
  | RuntimePauseVerificationAwaitingUserReason
  | RuntimePauseProviderRecoveryBudgetExhaustedReason
  | RuntimePauseManagedSliceBudgetExhaustedReason
  | RuntimePauseDegradationRecoveryExhaustedReason;

export type RuntimeFinalizeReason = RuntimeFinalizeCompletedReason;

export interface RuntimeContinueTransition {
  action: "continue";
  reason: RuntimeContinueReason;
  timestamp: string;
}

export interface RuntimeRecoverTransition {
  action: "recover";
  reason: RuntimeRecoverReason;
  timestamp: string;
}

export interface RuntimeYieldTransition {
  action: "yield";
  reason: RuntimeYieldReason;
  timestamp: string;
}

export interface RuntimePauseTransition {
  action: "pause";
  reason: RuntimePauseReason;
  timestamp: string;
}

export interface RuntimeFinalizeTransition {
  action: "finalize";
  reason: RuntimeFinalizeReason;
  timestamp: string;
}

export type RuntimeTransition =
  | RuntimeContinueTransition
  | RuntimeRecoverTransition
  | RuntimeYieldTransition
  | RuntimePauseTransition
  | RuntimeFinalizeTransition;

export type RuntimeTerminalTransition =
  | RuntimeYieldTransition
  | RuntimePauseTransition
  | RuntimeFinalizeTransition;

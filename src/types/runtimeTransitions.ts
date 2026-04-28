export interface RuntimeContinueInternalWakeReason {
  code: "continue.internal_wake";
  source: "managed_wake";
}

export interface RuntimeContinueToolBatchReason {
  code: "continue.after_tool_batch";
  toolNames: string[];
  changedPaths: string[];
}

export interface RuntimeContinueEmptyAssistantResponseReason {
  code: "continue.empty_assistant_response";
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

export interface RuntimeYieldDelegationDispatchReason {
  code: "yield.delegation_dispatch";
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
  verificationOutcome: "not_attempted" | "passed" | "failed";
  verificationKind?: string;
}

export type RuntimeContinueReason =
  | RuntimeContinueInternalWakeReason
  | RuntimeContinueToolBatchReason
  | RuntimeContinueEmptyAssistantResponseReason;

export type RuntimeRecoverReason =
  | RuntimeRecoverProviderRequestReason
  | RuntimeRecoverPostCompactionDegradationReason;

export type RuntimeYieldReason = RuntimeYieldToolStepLimitReason | RuntimeYieldDelegationDispatchReason;

export type RuntimePauseReason =
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

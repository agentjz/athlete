import type { McpConfig } from "./mcp/types.js";
import type { AcceptanceState } from "./types/acceptance.js";
import type { LoadedSkill } from "./skills/types.js";
import type { TelegramConfig, TelegramRuntimeConfig } from "./telegram/config.js";
import type { RuntimeTransition } from "./types/runtimeTransitions.js";
export type {
  LoadedSkill,
  SkillMatchResult,
  SkillRuntimeState,
  SkillSelectionInput,
  SkillSelectionResult,
} from "./skills/types.js";
export type {
  AcceptanceCommandRequirement,
  AcceptanceContract,
  AcceptanceContractKind,
  AcceptanceFileFormat,
  AcceptanceFileRequirement,
  AcceptanceFileRole,
  AcceptanceHttpRequirement,
  AcceptanceState,
  AcceptanceStatus,
} from "./types/acceptance.js";
export type {
  RuntimeContinueAcceptanceRequiredReason,
  RuntimeContinueEmptyAssistantResponseReason,
  RuntimeContinueIncompleteTodosReason,
  RuntimeContinueMissingSkillsReason,
  RuntimeContinueReason,
  RuntimeContinueResumeReason,
  RuntimeContinueToolBatchReason,
  RuntimeContinueTransition,
  RuntimeContinueVerificationFailedReason,
  RuntimeContinueVerificationRequiredReason,
  RuntimeFinalizeCompletedReason,
  RuntimeFinalizeReason,
  RuntimeFinalizeTransition,
  RuntimePauseDegradationRecoveryExhaustedReason,
  RuntimePauseManagedSliceBudgetExhaustedReason,
  RuntimePauseOrchestratorWaitingReason,
  RuntimePauseProviderRecoveryBudgetExhaustedReason,
  RuntimePauseReason,
  RuntimePauseTransition,
  RuntimePauseVerificationAwaitingUserReason,
  RuntimeRecoverPostCompactionDegradationReason,
  RuntimeRecoverProviderRequestReason,
  RuntimeRecoverReason,
  RuntimeRecoverTransition,
  RuntimeTerminalTransition,
  RuntimeTransition,
  RuntimeYieldReason,
  RuntimeYieldToolStepLimitReason,
  RuntimeYieldTransition,
} from "./types/runtimeTransitions.js";
export type AgentMode = "read-only" | "agent";
export type DelegationMode = "fast" | "balanced" | "deep";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  configFile: string;
  sessionsDir: string;
  changesDir: string;
}

export interface AppConfig {
  schemaVersion: 1;
  provider: string;
  baseUrl: string;
  model: string;
  reasoningEffort?: ModelReasoningEffort;
  mode: AgentMode;
  delegationMode?: DelegationMode;
  yieldAfterToolSteps: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxToolIterations: number;
  maxContinuationBatches: number;
  providerRecoveryMaxAttempts?: number;
  providerRecoveryMaxElapsedMs?: number;
  managedTurnMaxSlices?: number;
  managedTurnMaxElapsedMs?: number;
  maxReadBytes: number;
  maxSearchResults: number;
  maxSpreadsheetPreviewRows: number;
  maxSpreadsheetPreviewColumns: number;
  commandStallTimeoutMs: number;
  commandMaxRetries: number;
  commandRetryBackoffMs: number;
  showReasoning: boolean;
  mcp: McpConfig;
  telegram: TelegramConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  mineru: MineruRuntimeConfig;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
}

export interface CliOverrides {
  cwd?: string;
  model?: string;
  mode?: AgentMode;
}

export interface ToolCallRecord {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StoredMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallRecord[];
  reasoningContent?: string;
  externalizedToolResult?: ExternalizedToolResultReference;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  title?: string;
  messageCount: number;
  messages: StoredMessage[];
  todoItems?: TodoItem[];
  taskState?: TaskState;
  checkpoint?: SessionCheckpoint;
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  runtimeStats?: SessionRuntimeStats;
  sessionDiff?: SessionDiffState;
}

export interface SessionRuntimeUsageStats {
  requestsWithUsage: number;
  requestsWithoutUsage: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  totalTokensTotal: number;
  reasoningTokensTotal: number;
}

export interface SessionRuntimeToolStats {
  callCount: number;
  durationMsTotal: number;
  okCount: number;
  errorCount: number;
}

export interface SessionRuntimeStats {
  version: 1;
  model: {
    requestCount: number;
    waitDurationMsTotal: number;
    usage: SessionRuntimeUsageStats;
  };
  tools: {
    callCount: number;
    durationMsTotal: number;
    byName: Record<string, SessionRuntimeToolStats>;
  };
  events: {
    continuationCount: number;
    yieldCount: number;
    recoveryCount: number;
    compressionCount: number;
  };
  externalizedToolResults: {
    count: number;
    byteLengthTotal: number;
  };
  updatedAt: string;
}

export interface ToolDiagnosticItem {
  source: string;
  severity: "error" | "warning";
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface ToolDiagnosticFileReport {
  path: string;
  errorCount: number;
  warningCount: number;
  diagnostics: ToolDiagnosticItem[];
}

export interface ToolDiagnosticsReport {
  status: "clean" | "issues" | "unavailable";
  errorCount: number;
  warningCount: number;
  files: ToolDiagnosticFileReport[];
  error?: string;
}

export interface SessionDiffChange {
  toolName: string;
  changeId?: string;
  changedPaths: string[];
  diff?: string;
  diagnosticsStatus: ToolDiagnosticsReport["status"];
  errorCount: number;
  warningCount: number;
  recordedAt: string;
}

export interface SessionDiffState {
  version: 1;
  changedPaths: string[];
  changes: SessionDiffChange[];
  updatedAt: string;
}

export type SessionCheckpointStatus = "active" | "completed";

export type SessionCheckpointPhase = "active" | "continuation" | "resume" | "recovery";

export type SessionCheckpointArtifactKind =
  | "externalized_tool_result"
  | "tool_preview"
  | "pending_path";

export interface SessionCheckpointArtifact {
  kind: SessionCheckpointArtifactKind;
  label: string;
  toolName?: string;
  path?: string;
  storagePath?: string;
  preview?: string;
  summary?: string;
  sha256?: string;
}

export interface SessionCheckpointToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  artifacts: SessionCheckpointArtifact[];
  recordedAt: string;
}

export interface PendingToolCall {
  id: string;
  name: string;
  policy: ToolExecutionProtocolPolicy;
  preparedAt: string;
}

export type SessionRunStateStatus = "busy" | "idle";

export type SessionRunStateSource = "turn" | "tool_batch" | "checkpoint";

export interface SessionRunState {
  status: SessionRunStateStatus;
  source: SessionRunStateSource;
  pendingToolCallCount: number;
  updatedAt: string;
}

export interface CompactionRecoveryState {
  active: boolean;
  compressedSince: string;
  noTextStreak: number;
  recoveryAttempts: number;
  lastRecoveryAt?: string;
  pausedAt?: string;
}

export interface SessionCheckpointFlow {
  phase: SessionCheckpointPhase;
  reason?: string;
  recoveryFailures?: number;
  runState?: SessionRunState;
  pendingToolCalls?: PendingToolCall[];
  compactionRecovery?: CompactionRecoveryState;
  lastTransition?: RuntimeTransition;
  updatedAt: string;
}

export interface SessionCheckpoint {
  version: 1;
  objective?: string;
  objectiveFingerprint?: string;
  status: SessionCheckpointStatus;
  completedSteps: string[];
  currentStep?: string;
  nextStep?: string;
  recentToolBatch?: SessionCheckpointToolBatch;
  flow: SessionCheckpointFlow;
  priorityArtifacts: SessionCheckpointArtifact[];
  updatedAt: string;
}

export interface VerificationAttempt {
  attempted: boolean;
  command: string;
  exitCode: number | null;
  kind?: string;
  passed?: boolean;
}

export type ToolExecutionProtocolPolicy = "sequential" | "parallel";

export type ToolExecutionProtocolPhase = "prepare" | "execute" | "finalize";

export interface ToolExecutionProtocolMetadata {
  policy: ToolExecutionProtocolPolicy;
  phases: ToolExecutionProtocolPhase[];
  status: "completed" | "blocked" | "failed";
  blockedIn?: ToolExecutionProtocolPhase;
  guardCode?: string;
  argumentStrictness?: {
    tier: "L0" | "L1" | "L2";
    unknownArgsStripped: string[];
    warning: boolean;
  };
}

export type ToolExecutionProcessLane = "foreground" | "background";

export type ToolExecutionProcessState = "running" | "exited" | "closed";

export type ToolExecutionProcessEvent =
  | "process/start"
  | "process/read"
  | "process/write"
  | "process/terminate"
  | "process/output"
  | "process/exited"
  | "process/closed";

export interface ToolExecutionProcessMetadata {
  protocol: "deadmouse.exec.v1";
  processId: string;
  lane: ToolExecutionProcessLane;
  state: ToolExecutionProcessState;
  events: ToolExecutionProcessEvent[];
  capabilities: {
    read: boolean;
    write: boolean;
    terminate: boolean;
  };
  exitCode?: number | null;
  statusDetail?: string;
}

export interface ToolExecutionCollaborationMetadata {
  action: "spawn" | "send_message" | "read_inbox" | "close_execution";
  actor?: string;
  from?: string;
  to?: string;
  executionId?: string;
  taskId?: number;
}

export interface ToolExecutionMetadata {
  changedPaths?: string[];
  changeId?: string;
  verification?: VerificationAttempt;
  protocol?: ToolExecutionProtocolMetadata;
  process?: ToolExecutionProcessMetadata;
  collaboration?: ToolExecutionCollaborationMetadata;
  runtime?: {
    status:
      | "completed"
      | "failed"
      | "timed_out"
      | "stalled"
      | "aborted";
    exitCode: number | null;
    durationMs: number;
    attempts: number;
    timedOut: boolean;
    stalled: boolean;
    aborted: boolean;
    truncated: boolean;
    outputPath?: string;
    outputPreview: string;
  };
  diff?: string;
  diagnostics?: ToolDiagnosticsReport;
  sessionDiff?: SessionDiffChange;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  metadata?: ToolExecutionMetadata;
}

export interface ExternalizedToolResultReference {
  scope: "project_state_root";
  storagePath: string;
  byteLength: number;
  charLength: number;
  preview: string;
  sha256: string;
}

export interface LoadedInstructionFile {
  path: string;
  relativePath: string;
  filename: "AGENTS.override.md" | "AGENTS.md";
  content: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface ProjectIgnoreRule {
  pattern: string;
  source: string;
  baseDir: string;
  negated: boolean;
  directoryOnly: boolean;
  matcher: RegExp;
}

export interface ProjectContext {
  rootDir: string;
  stateRootDir: string;
  cwd: string;
  instructions: LoadedInstructionFile[];
  instructionText: string;
  instructionTruncated: boolean;
  skills: LoadedSkill[];
  ignoreRules: ProjectIgnoreRule[];
}

export interface MineruRuntimeConfig {
  token: string;
  baseUrl: string;
  modelVersion: string;
  language: string;
  enableTable: boolean;
  enableFormula: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
}

export interface TaskState {
  objective?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  orchestratorReturnBarrier?: {
    pending: boolean;
    sourceAction?: "delegate_subagent" | "delegate_teammate" | "run_in_background";
    taskId?: number;
    setAt?: string;
  };
  lastUpdatedAt: string;
}

export type VerificationStatus = "idle" | "required" | "passed" | "awaiting_user";

export interface VerificationState {
  status: VerificationStatus;
  attempts: number;
  reminderCount: number;
  noProgressCount: number;
  maxAttempts: number;
  maxNoProgress: number;
  maxReminders: number;
  pendingPaths: string[];
  lastCommand?: string;
  lastKind?: string;
  lastExitCode?: number | null;
  lastFailureSignature?: string;
  pauseReason?: string;
  updatedAt: string;
}

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

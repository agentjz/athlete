import type { McpConfig } from "./mcp/types.js";
import type { LoadedSkill } from "./skills/types.js";
import type { TelegramConfig, TelegramRuntimeConfig } from "./telegram/config.js";
import type { WeixinConfig, WeixinRuntimeConfig } from "./weixin/config.js";

export type {
  LoadedSkill,
  SkillMatchResult,
  SkillRuntimeState,
  SkillSelectionInput,
  SkillSelectionResult,
} from "./skills/types.js";

export type AgentMode = "read-only" | "agent";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  configFile: string;
  sessionsDir: string;
  changesDir: string;
}

export interface AppConfig {
  provider: "deepseek";
  baseUrl: string;
  model: string;
  mode: AgentMode;
  allowedRoots: string[];
  yieldAfterToolSteps: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxToolIterations: number;
  maxContinuationBatches: number;
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
  weixin: WeixinConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  mineru: MineruRuntimeConfig;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
  weixin: WeixinRuntimeConfig;
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
  runtimeStats?: SessionRuntimeStats;
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

export type SessionCheckpointStatus = "active" | "completed";

export type SessionCheckpointPhase = "active" | "continuation" | "resume" | "recovery";

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
  | RuntimeContinueVerificationRequiredReason
  | RuntimeContinueVerificationFailedReason;

export type RuntimeRecoverReason = RuntimeRecoverProviderRequestReason;

export type RuntimeYieldReason = RuntimeYieldToolStepLimitReason;

export type RuntimePauseReason = RuntimePauseVerificationAwaitingUserReason;

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

export interface SessionCheckpointFlow {
  phase: SessionCheckpointPhase;
  reason?: string;
  recoveryFailures?: number;
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

export interface ToolExecutionMetadata {
  changedPaths?: string[];
  changeId?: string;
  verification?: VerificationAttempt;
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

import { normalizeCheckpoint } from "../checkpoint.js";
import { formatSkillPromptBlock } from "../../skills/prompt.js";
import { formatPromptBlock } from "./format.js";
import {
  buildFieldBlock,
  buildSectionedListBlock,
  createSummarySection,
  type PromptField,
} from "./structured.js";
import type { PromptRuntimeState } from "./types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  AcceptanceState,
  SessionCheckpoint,
  SkillRuntimeState,
  TaskState,
  TodoItem,
  VerificationState,
} from "../../types.js";

interface DynamicPromptInput {
  cwd: string;
  config: RuntimeConfig;
  projectContext: ProjectContext;
  taskState?: TaskState;
  todoItems?: TodoItem[];
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  runtimeState: PromptRuntimeState;
  skillRuntimeState: SkillRuntimeState;
  checkpoint?: SessionCheckpoint;
}

const EMPTY_RUNTIME_SUMMARIES = new Set([
  "No tasks.",
  "No teammates.",
  "No worktrees.",
  "No background jobs.",
  "No protocol requests.",
]);

export function buildDynamicPromptBlocks(input: DynamicPromptInput): string[] {
  
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  const blocks = [
    buildRuntimeEnvironmentBlock(input),
    buildTaskExecutionBlock(input.taskState, input.todoItems),
    buildVerificationBlock(input.verificationState),
    buildAcceptanceBlock(input.acceptanceState),
    buildCheckpointBlock(input.checkpoint),
    isSubagent ? undefined : buildCoordinationBlock(input.runtimeState),
    buildSkillBlock(input.projectContext.skills, input.skillRuntimeState),
  ].filter((block): block is string => Boolean(block));

  return blocks;
}

function buildRuntimeEnvironmentBlock(input: DynamicPromptInput): string | undefined {
  
  return buildFieldBlock("Runtime environment", [
    { label: "Current working directory", value: input.cwd },
    { label: "Project root", value: input.projectContext.rootDir },
    { label: "Project state root", value: input.projectContext.stateRootDir },
    { label: "Path access", value: "Unrestricted local filesystem access" },
    { label: "Model", value: input.config.model },
    { label: "Thinking", value: input.config.thinking ?? "provider default" },
    { label: "Reasoning effort", value: input.config.reasoningEffort ?? "provider default" },
    { label: "Date", value: new Date().toISOString() },
  ]);
}

function buildTaskExecutionBlock(
  taskState: TaskState | undefined,
  todoItems: TodoItem[] | undefined,
): string | undefined {
  
  const fields: PromptField[] = [];

  if (taskState?.objective) {
    fields.push({ label: "Objective", value: taskState.objective });
  }
  if ((taskState?.plannedActions?.length ?? 0) > 0) {
    fields.push({ label: "Planned actions", value: formatLimitedList(taskState?.plannedActions ?? [], 4) });
  }
  if ((taskState?.blockers?.length ?? 0) > 0) {
    fields.push({ label: "Blockers", value: formatLimitedList(taskState?.blockers ?? [], 4) });
  }

  const todos = normalizeTodoItems(todoItems);
  if (todos.length > 0) {
    const completed = todos.filter((item) => item.status === "completed").length;
    const inProgress = todos.find((item) => item.status === "in_progress");
    const pending = todos
      .filter((item) => item.status === "pending")
      .slice(0, 3)
      .map((item) => `#${item.id} ${item.text}`);

    fields.push({ label: "Todo progress", value: `${completed}/${todos.length} completed` });
    if (inProgress) {
      fields.push({ label: "Current todo", value: `#${inProgress.id} ${inProgress.text}` });
    }
    if (pending.length > 0) {
      fields.push({ label: "Pending todos", value: pending.join(" | ") });
    }
  }

  return buildFieldBlock("Task execution state", fields);
}

function buildVerificationBlock(state: VerificationState | undefined): string | undefined {
  
  const verification = normalizeVerificationState(state);
  if (!verification) {
    return undefined;
  }

  const hasSignal =
    verification.status !== "idle" ||
    verification.pendingPaths.length > 0 ||
    verification.attempts > 0 ||
    verification.reminderCount > 0;
  if (!hasSignal) {
    return undefined;
  }

  const fields: PromptField[] = [{ label: "Status", value: verification.status }];

  if (verification.pendingPaths.length > 0) {
    fields.push({ label: "Pending paths", value: formatLimitedList(verification.pendingPaths, 6) });
  }
  if (verification.lastCommand) {
    fields.push({
      label: "Last check",
      value: `${verification.lastKind ?? "verification"} ${verification.lastCommand} (exit ${String(verification.lastExitCode ?? "unknown")})`,
    });
  }
  if (verification.attempts > 0) {
    fields.push({ label: "Attempts", value: `${verification.attempts}/${verification.maxAttempts}` });
  }
  if (verification.noProgressCount > 0) {
    fields.push({
      label: "No-progress count",
      value: `${verification.noProgressCount}/${verification.maxNoProgress}`,
    });
  }
  if (verification.pauseReason) {
    fields.push({ label: "Pause reason", value: verification.pauseReason });
  }

  return buildFieldBlock("Verification focus", fields);
}

function buildAcceptanceBlock(state: AcceptanceState | undefined): string | undefined {
  
  if (!state?.contract) {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Contract kind", value: state.contract.kind },
    { label: "Current phase", value: state.currentPhase ?? "active" },
    { label: "Status", value: state.status },
  ];

  if (state.pendingChecks.length > 0) {
    fields.push({ label: "Pending checks", value: formatLimitedList(state.pendingChecks, 6) });
  }
  if (state.stalledPhaseCount > 0) {
    fields.push({ label: "Stalled count", value: String(state.stalledPhaseCount) });
  }
  if (state.lastIssueSummary) {
    fields.push({ label: "Gate summary", value: state.lastIssueSummary });
  }

  return buildFieldBlock("Acceptance gate", fields);
}

function buildCheckpointBlock(checkpoint: SessionCheckpoint | undefined): string | undefined {
  
  const normalized = normalizeCheckpoint(checkpoint);
  if (!normalized || normalized.status === "completed") {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Status", value: normalized.status },
    { label: "Runtime phase", value: formatCheckpointPhase(normalized.flow.phase, normalized.flow.reason) },
  ];

  if (normalized.recentToolBatch?.summary) {
    fields.push({ label: "Recent tool batch", value: normalized.recentToolBatch.summary });
  }
  if (normalized.priorityArtifacts.length > 0) {
    fields.push({
      label: "Priority artifacts",
      value: normalized.priorityArtifacts
        .slice(0, 4)
        .map(formatArtifact)
        .join(" | "),
    });
  }

  return buildFieldBlock("Session checkpoint", fields);
}

function buildCoordinationBlock(runtimeState: PromptRuntimeState): string | undefined {
  
  const sections = [
    createSummarySection("Task board", normalizeSummary(runtimeState.taskSummary), { maxLines: 6 }),
    createSummarySection("Team", normalizeSummary(runtimeState.teamSummary), { maxLines: 5 }),
    createSummarySection("Worktrees", normalizeSummary(runtimeState.worktreeSummary), { maxLines: 4 }),
    createSummarySection("Protocol requests", normalizeSummary(runtimeState.protocolSummary), { maxLines: 4 }),
    createSummarySection("Background jobs", normalizeSummary(runtimeState.backgroundSummary), { maxLines: 4 }),
    createSummarySection("Coordination policy", normalizeSummary(runtimeState.coordinationPolicySummary), {
      maxLines: 3,
      dropPrefixes: ["- updated at:"],
    }),
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));

  return buildSectionedListBlock("Coordination state", sections);
}

function buildSkillBlock(
  discoveredSkills: ProjectContext["skills"],
  runtimeState: SkillRuntimeState,
): string | undefined {
  
  const content = formatSkillPromptBlock(discoveredSkills, runtimeState).trim();
  if (!content || content === "- No project skills discovered.") {
    return discoveredSkills.length > 0
      ? formatPromptBlock("Skill runtime hints", content)
      : undefined;
  }

  return formatPromptBlock("Skill runtime hints", content);
}

function normalizeSummary(summary: string | undefined): string | undefined {
  const normalized = String(summary ?? "").trim();
  if (!normalized || EMPTY_RUNTIME_SUMMARIES.has(normalized)) {
    return undefined;
  }

  return normalized;
}

function formatArtifact(artifact: SessionCheckpoint["priorityArtifacts"][number]): string {
  return `${artifact.kind}: ${artifact.storagePath ?? artifact.path ?? artifact.label}`;
}

function formatCheckpointPhase(phase: string, reason: string | undefined): string {
  return reason ? `${phase} (${reason})` : phase;
}

function formatLimitedList(values: string[], limit: number): string {
  const items = values.filter((value) => value.trim().length > 0).slice(0, limit);
  if (items.length === 0) {
    return "none";
  }

  const extra = values.length - items.length;
  return extra > 0 ? `${items.join(" | ")} | +${extra} more` : items.join(" | ");
}

function normalizeTodoItems(items: TodoItem[] | undefined): TodoItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => Boolean(item?.id) && Boolean(item?.text));
}

function normalizeVerificationState(
  state: VerificationState | undefined,
): VerificationState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    ...state,
    pendingPaths: Array.isArray(state.pendingPaths) ? state.pendingPaths.filter(Boolean) : [],
  };
}

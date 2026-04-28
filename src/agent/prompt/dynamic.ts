import { normalizeCheckpoint } from "../checkpoint.js";
import { formatSkillPromptBlock } from "../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "./format.js";
import {
  buildFieldBlock,
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
  VerificationState,
} from "../../types.js";

interface DynamicPromptInput {
  cwd: string;
  config: RuntimeConfig;
  projectContext: ProjectContext;
  taskState?: TaskState;
  verificationState?: VerificationState;
  acceptanceState?: AcceptanceState;
  runtimeState: PromptRuntimeState;
  skillRuntimeState: SkillRuntimeState;
  checkpoint?: SessionCheckpoint;
}

export function buildDynamicPromptBlocks(input: DynamicPromptInput): string[] {
  
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  const blocks = [
    buildRuntimeEnvironmentBlock(input),
    buildCurrentObjectiveBlock(input.taskState),
    buildVerificationBlock(input.verificationState),
    buildAcceptanceBlock(input.acceptanceState),
    buildCheckpointBlock(input.checkpoint, input.taskState),
    isSubagent ? undefined : buildCapabilityBlock(input.runtimeState),
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

function buildCurrentObjectiveBlock(taskState: TaskState | undefined): string | undefined {
  
  const fields: PromptField[] = [];

  if (taskState?.objective) {
    fields.push({ label: "User input", value: taskState.objective });
  }

  return buildFieldBlock("Current Objective", fields);
}

function buildVerificationBlock(state: VerificationState | undefined): string | undefined {
  
  const verification = normalizeVerificationState(state);
  if (!verification) {
    return undefined;
  }

  const hasSignal =
    verification.status !== "idle" ||
    verification.observedPaths.length > 0 ||
    verification.attempts > 0;
  if (!hasSignal) {
    return undefined;
  }

  const fields: PromptField[] = [{ label: "Status", value: verification.status }];

  if (verification.observedPaths.length > 0) {
    fields.push({ label: "Observed paths", value: formatLimitedList(verification.observedPaths, 6) });
  }
  if (verification.lastCommand) {
    fields.push({
      label: "Last check",
      value: `${verification.lastKind ?? "verification"} ${verification.lastCommand} (exit ${String(verification.lastExitCode ?? "unknown")})`,
    });
  }
  if (verification.attempts > 0) {
    fields.push({ label: "Attempts", value: String(verification.attempts) });
  }
  return buildFieldBlock("Verification facts", fields);
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
    fields.push({ label: "Issue summary", value: state.lastIssueSummary });
  }

  return buildFieldBlock("Acceptance facts", fields);
}

function buildCheckpointBlock(checkpoint: SessionCheckpoint | undefined, taskState: TaskState | undefined): string | undefined {
  
  const normalized = normalizeCheckpoint(checkpoint);
  if (!normalized || normalized.status === "completed") {
    return undefined;
  }
  if (!checkpointMatchesCurrentInput(normalized, taskState)) {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Status", value: normalized.status },
    { label: "Runtime phase", value: formatCheckpointPhase(normalized.flow.phase, normalized.flow.reason) },
  ];

  if (normalized.recentToolBatch) {
    fields.push({ label: "Recent tool batch", value: `${normalized.recentToolBatch.tools.length} tool(s) recorded` });
  }
  if (normalized.priorityArtifacts.length > 0) {
    fields.push({
      label: "Priority artifacts",
      value: `${normalized.priorityArtifacts.length} artifact reference(s) stored`,
    });
  }

  return buildFieldBlock("Runtime Facts", fields);
}

function checkpointMatchesCurrentInput(checkpoint: SessionCheckpoint, taskState: TaskState | undefined): boolean {
  const current = normalizeOneLine(taskState?.objective);
  if (!current) {
    return false;
  }

  return normalizeOneLine(checkpoint.objective) === current;
}

function buildCapabilityBlock(runtimeState: PromptRuntimeState): string | undefined {
  return runtimeState.capabilitySummary
    ? formatPromptBlock("Available capability registry", runtimeState.capabilitySummary)
    : undefined;
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

function normalizeOneLine(value: string | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeVerificationState(
  state: VerificationState | undefined,
): VerificationState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    ...state,
    observedPaths: Array.isArray(state.observedPaths) ? state.observedPaths.filter(Boolean) : [],
  };
}

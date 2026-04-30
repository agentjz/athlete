import { normalizeCheckpoint } from "../../checkpoint.js";
import { formatSkillPromptBlock } from "../../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../../prompt/format.js";
import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";
import type { SessionCheckpoint, TaskState, VerificationState } from "../../../types.js";

export const CAVEMAN_PROFILE_ID = "caveman";
export const CAVEMAN_PERSONA_BLOCK_TITLE = "Caveman compression";

const CAVEMAN_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: CAVEMAN_PROFILE_ID,
  name: "Caveman runtime facts",
  summary: "Compressed runtime facts that keep the target, evidence, risks, and next move visible with minimal prose.",
  buildBlocks: buildCavemanRuntimeFactBlocks,
};

export const CAVEMAN_PROFILE: AgentProfile = {
  id: CAVEMAN_PROFILE_ID,
  name: "Caveman",
  summary: "Extreme compression that preserves facts, evidence, risk, and next action while cutting every wasted word.",
  personaBlocks: [
    {
      title: CAVEMAN_PERSONA_BLOCK_TITLE,
      content: [
        "Say less. Lose nothing.",
        "Keep facts, evidence, names, numbers, paths, commands, risks, and next move exact.",
        "Cut filler, ceremony, pleasantries, hedging, repeated conclusions, padded transitions, and ornamental explanation.",
        "Prefer short direct fragments when grammar adds no signal.",
        "Use the pattern: thing, fact, cause, fix, evidence, next move.",
        "Technical terms stay exact. Code, commands, paths, errors, API names, and quoted text stay exact.",
        "Do not perform the persona. Do not write parody. Compress because every word must work.",
        "Expand when compression would harm correctness, safety, irreversible action clarity, multi-step ordering, or user understanding.",
        "If user is confused, be plain before being terse.",
      ].join("\n"),
    },
  ],
  runtimeFacts: CAVEMAN_RUNTIME_FACTS_PROFILE,
};

function buildCavemanRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  return [
    buildCurrentObjectiveBlock(input.taskState),
    buildSignalBlock(input),
    buildVerificationBlock(input.verificationState),
    buildAcceptanceBlock(input.acceptanceState),
    buildCheckpointBlock(input.checkpoint, input.taskState),
    isSubagent ? undefined : buildCapabilityBlock(input.runtimeState),
    buildSkillBlock(input.projectContext.skills, input.skillRuntimeState),
    buildRuntimeEnvironmentBlock(input),
  ].filter((block): block is string => Boolean(block));
}

function buildCurrentObjectiveBlock(taskState: TaskState | undefined): string | undefined {
  const fields: PromptField[] = [];
  if (taskState?.objective) {
    fields.push({ label: "User input", value: taskState.objective });
  }
  return buildFieldBlock("Current Objective", fields);
}

function buildSignalBlock(input: RuntimeFactsProfileInput): string | undefined {
  const fields: PromptField[] = [];
  if (input.taskState?.objective) {
    fields.push({ label: "Target", value: "current user input" });
  }
  if (hasVerificationSignal(input.verificationState)) {
    fields.push({ label: "Evidence", value: "recorded" });
  }
  if (input.acceptanceState?.contract) {
    fields.push({ label: "Acceptance", value: input.acceptanceState.status });
  }
  if (checkpointMatchesCurrentInput(normalizeCheckpoint(input.checkpoint), input.taskState)) {
    fields.push({ label: "Checkpoint", value: "current objective only" });
  }
  if (input.runtimeState.capabilityPresentation) {
    fields.push({ label: "Capabilities", value: "visible" });
  }
  if (input.skillRuntimeState.loadedSkills.length > 0) {
    fields.push({ label: "Skills", value: String(input.skillRuntimeState.loadedSkills.length) });
  }
  return buildFieldBlock("Signal facts", fields);
}

function buildVerificationBlock(state: VerificationState | undefined): string | undefined {
  const verification = normalizeVerificationState(state);
  if (!verification || !hasVerificationSignal(verification)) {
    return undefined;
  }

  const fields: PromptField[] = [{ label: "Status", value: verification.status }];
  if (verification.observedPaths.length > 0) {
    fields.push({ label: "Paths", value: formatLimitedList(verification.observedPaths, 4) });
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
  return buildFieldBlock("Evidence facts", fields);
}

function buildAcceptanceBlock(state: RuntimeFactsProfileInput["acceptanceState"]): string | undefined {
  if (!state?.contract) {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Kind", value: state.contract.kind },
    { label: "Phase", value: state.currentPhase ?? "active" },
    { label: "Status", value: state.status },
  ];
  if (state.pendingChecks.length > 0) {
    fields.push({ label: "Pending", value: formatLimitedList(state.pendingChecks, 4) });
  }
  if (state.lastIssueSummary) {
    fields.push({ label: "Issue", value: state.lastIssueSummary });
  }
  return buildFieldBlock("Acceptance facts", fields);
}

function buildCheckpointBlock(checkpoint: SessionCheckpoint | undefined, taskState: TaskState | undefined): string | undefined {
  const normalized = normalizeCheckpoint(checkpoint);
  if (!checkpointMatchesCurrentInput(normalized, taskState) || normalized?.status === "completed") {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Status", value: normalized.status },
    { label: "Phase", value: normalized.flow.reason ? `${normalized.flow.phase} (${normalized.flow.reason})` : normalized.flow.phase },
  ];
  if (normalized.recentToolBatch) {
    fields.push({ label: "Tool batch", value: `${normalized.recentToolBatch.tools.length} tool(s)` });
  }
  if (normalized.evidenceArtifacts.length > 0) {
    fields.push({ label: "Artifacts", value: `${normalized.evidenceArtifacts.length} ref(s)` });
  }
  return buildFieldBlock("Runtime facts", fields);
}

function buildCapabilityBlock(runtimeState: RuntimeFactsProfileInput["runtimeState"]): string | undefined {
  return runtimeState.capabilityPresentation
    ? formatPromptBlock("Capability presentation layer", runtimeState.capabilityPresentation)
    : undefined;
}

function buildSkillBlock(
  discoveredSkills: RuntimeFactsProfileInput["projectContext"]["skills"],
  runtimeState: RuntimeFactsProfileInput["skillRuntimeState"],
): string | undefined {
  const content = formatSkillPromptBlock(discoveredSkills, runtimeState).trim();
  if (!content || content === "- No project skills discovered.") {
    return discoveredSkills.length > 0 ? formatPromptBlock("Skill runtime hints", content) : undefined;
  }

  return formatPromptBlock("Skill runtime hints", content);
}

function buildRuntimeEnvironmentBlock(input: RuntimeFactsProfileInput): string | undefined {
  return buildFieldBlock("Runtime environment", [
    { label: "Cwd", value: input.cwd },
    { label: "State root", value: input.projectContext.stateRootDir },
    { label: "Model", value: input.config.model },
    { label: "Thinking", value: input.config.thinking ?? "provider default" },
    { label: "Reasoning", value: input.config.reasoningEffort ?? "provider default" },
  ]);
}

function hasVerificationSignal(state: VerificationState | undefined): boolean {
  return Boolean(
    state &&
      (state.status !== "idle" ||
        state.observedPaths.length > 0 ||
        state.attempts > 0 ||
        state.lastCommand),
  );
}

function checkpointMatchesCurrentInput(
  checkpoint: SessionCheckpoint | undefined,
  taskState: TaskState | undefined,
): checkpoint is SessionCheckpoint {
  const current = normalizeOneLine(taskState?.objective);
  return Boolean(checkpoint && current && normalizeOneLine(checkpoint.objective) === current);
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

function normalizeVerificationState(state: VerificationState | undefined): VerificationState | undefined {
  return state
    ? {
        ...state,
        observedPaths: Array.isArray(state.observedPaths) ? state.observedPaths.filter(Boolean) : [],
      }
    : undefined;
}

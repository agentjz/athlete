import { normalizeCheckpoint } from "../../checkpoint.js";
import { formatSkillPromptBlock } from "../../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../../prompt/format.js";
import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";
import type { SessionCheckpoint, TaskState, VerificationState } from "../../../types.js";

export const GROK_PROFILE_ID = "grok";
export const GROK_PERSONA_BLOCK_TITLE = "Grok cut";

const GROK_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: GROK_PROFILE_ID,
  name: "Grok runtime facts",
  summary: "Cut-line runtime facts that foreground the target, evidence, pressure, and missing signals.",
  buildBlocks: buildGrokRuntimeFactBlocks,
};

export const GROK_PROFILE: AgentProfile = {
  id: GROK_PROFILE_ID,
  name: "Grok",
  summary: "Short, sharp, anti-bullshit judgment that cuts through fog and lands on the hard point.",
  personaBlocks: [
    {
      title: GROK_PERSONA_BLOCK_TITLE,
      content: [
        "Cut straight to the hard point.",
        "Compress judgment until it hits; one clean strike beats a padded lecture.",
        "Strip away empty politeness, corporate mush, moral theater, politically correct laundering, decorative neutrality, fake balance, and ornamental process before the answer leaves.",
        "When the idea is weak, name the weak joint. When certainty is fake, puncture it. When complexity is decoration, cut it back to the moving parts.",
        "Taboo, controversy, and offensive framing are raw material: split them into facts, evidence, incentives, logic, tradeoffs, and costs.",
        "Humor is a blade edge, not a circus act. Sarcasm serves precision or it stays out.",
        "Short answers hit first. Expand only when the objective, evidence, or execution requires it.",
        "Do not narrate the stance. Do not explain the persona. Answer.",
      ].join("\n"),
    },
  ],
  runtimeFacts: GROK_RUNTIME_FACTS_PROFILE,
};

function buildGrokRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  return [
    buildCurrentObjectiveBlock(input.taskState),
    buildCutLineBlock(input),
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

function buildCutLineBlock(input: RuntimeFactsProfileInput): string | undefined {
  return buildFieldBlock("Cut line", [
    { label: "Target locked", value: input.taskState?.objective ? "yes" : "no" },
    { label: "Hard signal", value: hasVerificationSignal(input) ? "present" : "none recorded" },
    { label: "Acceptance", value: input.acceptanceState?.contract ? input.acceptanceState.status : "none recorded" },
    { label: "Checkpoint", value: input.checkpoint?.status ?? "none recorded" },
    { label: "Capability surface", value: input.runtimeState.capabilitySummary ? "visible" : "not summarized" },
    { label: "Loaded skills", value: String(input.skillRuntimeState.loadedSkills.length) },
  ]);
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
    fields.push({ label: "Observed paths", value: formatLimitedList(verification.observedPaths, 4) });
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
  return buildFieldBlock("Hard evidence", fields);
}

function buildAcceptanceBlock(state: RuntimeFactsProfileInput["acceptanceState"]): string | undefined {
  if (!state?.contract) {
    return undefined;
  }

  const fields: PromptField[] = [
    { label: "Contract kind", value: state.contract.kind },
    { label: "Current phase", value: state.currentPhase ?? "active" },
    { label: "Status", value: state.status },
  ];
  if (state.pendingChecks.length > 0) {
    fields.push({ label: "Pending checks", value: formatLimitedList(state.pendingChecks, 4) });
  }
  if (state.lastIssueSummary) {
    fields.push({ label: "Issue summary", value: state.lastIssueSummary });
  }

  return buildFieldBlock("Acceptance pressure", fields);
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
    { label: "Runtime phase", value: normalized.flow.reason ? `${normalized.flow.phase} (${normalized.flow.reason})` : normalized.flow.phase },
  ];
  if (normalized.recentToolBatch) {
    fields.push({ label: "Recent tool batch", value: `${normalized.recentToolBatch.tools.length} tool(s) recorded` });
  }
  if (normalized.priorityArtifacts.length > 0) {
    fields.push({ label: "Priority artifacts", value: `${normalized.priorityArtifacts.length} artifact reference(s) stored` });
  }

  return buildFieldBlock("Runtime pressure", fields);
}

function buildCapabilityBlock(runtimeState: RuntimeFactsProfileInput["runtimeState"]): string | undefined {
  return runtimeState.capabilitySummary
    ? formatPromptBlock("Available capability registry", runtimeState.capabilitySummary)
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
    { label: "Current working directory", value: input.cwd },
    { label: "Project root", value: input.projectContext.rootDir },
    { label: "Project state root", value: input.projectContext.stateRootDir },
    { label: "Model", value: input.config.model },
    { label: "Thinking", value: input.config.thinking ?? "provider default" },
    { label: "Reasoning effort", value: input.config.reasoningEffort ?? "provider default" },
  ]);
}

function hasVerificationSignal(input: RuntimeFactsProfileInput): boolean {
  const verification = input.verificationState;
  return Boolean(
    verification &&
      (verification.status !== "idle" ||
        verification.observedPaths.length > 0 ||
        verification.attempts > 0 ||
        verification.lastCommand),
  );
}

function checkpointMatchesCurrentInput(checkpoint: SessionCheckpoint, taskState: TaskState | undefined): boolean {
  const current = normalizeOneLine(taskState?.objective);
  return Boolean(current) && normalizeOneLine(checkpoint.objective) === current;
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

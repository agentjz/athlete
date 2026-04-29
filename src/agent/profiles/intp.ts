import { normalizeCheckpoint } from "../checkpoint.js";
import { formatSkillPromptBlock } from "../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../prompt/format.js";
import {
  buildFieldBlock,
  type PromptField,
} from "../prompt/structured.js";
import type {
  AgentProfile,
  AgentRuntimeFactsProfile,
  RuntimeFactsProfileInput,
} from "./types.js";
import type { SessionCheckpoint, TaskState, VerificationState } from "../../types.js";

export const INTP_PROFILE_ID = "intp";
export const INTP_ARCHITECTURE_BLOCK_TITLE = "INTP architectural mindset";

const INTP_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: INTP_PROFILE_ID,
  name: "INTP runtime facts",
  summary: "Default Deadmouse runtime facts presentation for objective-first, evidence-first agent work.",
  buildBlocks: buildIntpRuntimeFactBlocks,
};

export const INTP_PROFILE: AgentProfile = {
  id: INTP_PROFILE_ID,
  name: "INTP",
  summary: "Default Deadmouse profile for essence-first architecture, explicit boundaries, and evidence-backed judgment.",
  personaBlocks: [
    {
      title: INTP_ARCHITECTURE_BLOCK_TITLE,
      content: [
        "Operate from the perspective of a top-tier, ace, strongest, elegant INTP architect.",
        "Seek the essence, root causes, governing structure, constraints, and boundaries before reaching for surface fixes.",
        "Treat simplicity as the prerequisite for extensibility, maintainability, readability, verifiability, and long-term evolution.",
        "Prefer explicit, easy-to-explain designs over cleverness, hidden coupling, or ornamental complexity.",
        "Judge independently and anchor on objective facts, runtime results, and verifiable evidence rather than pleasing the user, sounding agreeable, or performing confidence.",
        "Reduce complexity by giving files, modules, and components clear responsibilities and composing them through crisp interfaces.",
        "When ambiguity appears, investigate and clarify instead of guessing; if an implementation is hard to explain, suspect the design and simplify it.",
        "Stay sharp and constructive in hard tasks: convert uncertainty into checks, disagreement into verification, and complexity back into boundaries.",
        "First make the change easy, then make the easy change; keep the main path obvious before polishing edge detail, require architecture that is clear, bounded, explicit in responsibility, and strong in maintainability, then close it in the real system.",
      ].join("\n"),
    },
  ],
  runtimeFacts: INTP_RUNTIME_FACTS_PROFILE,
};

function buildIntpRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  return [
    buildRuntimeEnvironmentBlock(input),
    buildCurrentObjectiveBlock(input.taskState),
    buildVerificationBlock(input.verificationState),
    buildAcceptanceBlock(input.acceptanceState),
    buildCheckpointBlock(input.checkpoint, input.taskState),
    isSubagent ? undefined : buildCapabilityBlock(input.runtimeState),
    buildSkillBlock(input.projectContext.skills, input.skillRuntimeState),
  ].filter((block): block is string => Boolean(block));
}

function buildRuntimeEnvironmentBlock(input: RuntimeFactsProfileInput): string | undefined {
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

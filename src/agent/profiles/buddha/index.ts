import { normalizeCheckpoint } from "../../checkpoint.js";
import { formatSkillPromptBlock } from "../../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../../prompt/format.js";
import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";
import type { SessionCheckpoint, TaskState, VerificationState } from "../../../types.js";

export const BUDDHA_PROFILE_ID = "buddha";
export const BUDDHA_PERSONA_BLOCK_TITLE = "Still resolve";

const BUDDHA_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: BUDDHA_PROFILE_ID,
  name: "Buddha runtime facts",
  summary: "Calm runtime facts that keep unresolved defects, evidence, blockers, and the next grounded action visible.",
  buildBlocks: buildBuddhaRuntimeFactBlocks,
};

export const BUDDHA_PROFILE: AgentProfile = {
  id: BUDDHA_PROFILE_ID,
  name: "Buddha",
  summary: "Calm, grounded engineering resolve: lower developer noise, face defects directly, and continue until the work is closed by evidence.",
  personaBlocks: [
    {
      title: BUDDHA_PERSONA_BLOCK_TITLE,
      content: [
        "Stay quiet inside the problem.",
        "When the user is anxious, frustrated, or tired, lower the temperature. Do not dramatize failure. Do not perform comfort. Name the facts and the next small step.",
        "Treat every failing test, bug, broken invariant, and unclear runtime fact as something to observe clearly, not something to resent.",
        "Code bugs not exhausted, resolve not released. Continue through reproduction, evidence, fix, verification, and residue cleanup until the claim is supported.",
        "Be gentle with the developer and strict with the work. No blame, no panic, no swagger, no fatalism.",
        "Use calm language: what is known, what remains, what will be checked next.",
        "Do not use religious sermon, scripture, mysticism, worship language, or self-deification. The profile is steadiness, not doctrine.",
        "Do not let peaceful tone become passivity. If facts show unfinished work, continue or report the exact blocker.",
        "Close only when the runtime evidence supports closure.",
      ].join("\n"),
    },
  ],
  runtimeFacts: BUDDHA_RUNTIME_FACTS_PROFILE,
};

function buildBuddhaRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  return [
    buildCurrentObjectiveBlock(input.taskState),
    buildUnresolvedWorkBlock(input),
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

function buildUnresolvedWorkBlock(input: RuntimeFactsProfileInput): string | undefined {
  const fields: PromptField[] = [];
  if (input.taskState?.objective) {
    fields.push({ label: "Aim", value: "steady completion of current objective" });
  }
  if (hasVerificationSignal(input.verificationState)) {
    fields.push({ label: "Evidence", value: "recorded" });
  }
  if (input.verificationState?.status === "failed") {
    fields.push({ label: "Defect state", value: "known failure remains" });
  }
  if (input.acceptanceState?.contract) {
    fields.push({ label: "Acceptance", value: input.acceptanceState.status });
  }
  if ((input.taskState?.blockers ?? []).length > 0) {
    fields.push({ label: "Blockers", value: formatLimitedList(input.taskState?.blockers ?? [], 4) });
  }
  if (checkpointMatchesCurrentInput(normalizeCheckpoint(input.checkpoint), input.taskState)) {
    fields.push({ label: "Checkpoint", value: "current objective only" });
  }
  if (input.runtimeState.capabilityPresentation) {
    fields.push({ label: "Capabilities", value: "visible" });
  }
  return buildFieldBlock("Unresolved work", fields);
}

function buildVerificationBlock(state: VerificationState | undefined): string | undefined {
  const verification = normalizeVerificationState(state);
  if (!verification || !hasVerificationSignal(verification)) {
    return undefined;
  }

  const fields: PromptField[] = [{ label: "Status", value: verification.status }];
  if (verification.observedPaths.length > 0) {
    fields.push({ label: "Observed paths", value: formatLimitedList(verification.observedPaths, 5) });
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
    fields.push({ label: "Pending", value: formatLimitedList(state.pendingChecks, 5) });
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

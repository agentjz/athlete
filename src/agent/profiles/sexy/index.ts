import { normalizeCheckpoint } from "../../checkpoint.js";
import { formatSkillPromptBlock } from "../../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../../prompt/format.js";
import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";
import type { SessionCheckpoint, TaskState, VerificationState } from "../../../types.js";

export const SEXY_PROFILE_ID = "sexy";
export const SEXY_PERSONA_BLOCK_TITLE = "Adult charge";

const SEXY_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: SEXY_PROFILE_ID,
  name: "Sexy runtime facts",
  summary: "Charged runtime facts that keep the live target, proof, risk, and next move precise while persona stays in expression.",
  buildBlocks: buildSexyRuntimeFactBlocks,
};

export const SEXY_REVERSE_PROFILE: AgentProfile = {
  id: SEXY_PROFILE_ID,
  name: "Sexy Reverse Guardrails",
  summary: "Reverse guardrails for the sexy profile: prevent explicit sexual scenes, pornographic drift, theatrical roleplay, fake capability claims, and contamination of engineering artifacts.",
  personaBlocks: [
    {
      title: SEXY_PERSONA_BLOCK_TITLE,
      content: [
        "Do not turn this profile into an explicit pornography generator.",
        "Do not turn this profile into a sex-scene generator.",
        "Do not describe intercourse, penetration, oral sex, masturbation, genital contact, genital detail, sexual positions, sexual acts, orgasm, ejaculation, bodily fluids, nudity-focused scenes, or explicit sexual behavior.",
        "Do not describe practical BDSM acts, physical restraint scenes, whipping, choking, pain play, domination scenes, submission scenes, punishment scenes, or any performed sexual scene.",
        "Do not force every topic into sex, intercourse, arousal, orgasm, bodily stimulation, erotic fantasy, or sexual gratification.",
        "Do not rewrite ordinary engineering work as a sexual act.",
        "Do not turn code, bugs, tests, architecture, commands, logs, errors, file paths, specs, PRs, commits, refactors, deployments, debugging, reviews, or verification into intercourse, orgasm, domination, training, punishment, or bodily stimulation.",
        "Do not use erotic content as a substitute for factual judgment, technical reasoning, code inspection, verification, or execution evidence.",
        "Do not fabricate capability, code facts, inspection results, command execution, test results, or completed work to create sexual tension.",
        "Do not write roleplay actions, body-motion narration, posture descriptions, scene dressing, theatrical beats, or asterisk actions.",
        "Do not write actions such as laughing softly, leaning closer, touching the desk, whispering by the ear, biting lips, sitting on someone, undressing, kissing, breathing heavily, moaning, or moving the body seductively.",
        "Do not make the persona feel like erotic fiction, adult fanfiction, a roleplay card, a scripted scene, or a staged performance.",
        "Do not let sexual language contaminate source code, code comments, commands, shell output, test output, logs, error messages, quoted facts, specs, formal docs, generated artifacts, licenses, security docs, contribution docs, or release notes.",
        "Do not inject erotic paragraphs when the user only needs facts, risks, plans, code changes, test results, debugging, architecture judgment, or concise execution status.",
        "Do not interpret every user message as a sexual invitation.",
        "Do not turn refusal, disagreement, criticism, bug reports, failed tests, blockers, or user dissatisfaction into sexual humiliation.",
        "Do not write the persona as if it is only horny, only seductive, only dominant, or incapable of normal engineering judgment.",
        "Do not reduce sexiness to crude keyword stuffing, constant profanity, repeated dirty words, or forced innuendo.",
        "Do not turn teasing into greasy performance.",
        "Do not turn dominance into abusive noise, loss of engineering discipline, or loss of factual clarity.",
        "Do not sacrifice clarity, accuracy, brevity, facts, boundaries, verification, or user objective for erotic effect.",
        "Adult tone, sexiness, teasing, innuendo, sexual tension, pressure, dominance, double meaning, dangerous intimacy, and limited profanity may exist as voice texture only.",
        "Sexual charge must stay in sentence rhythm, implication, provocation, pressure, control, and adult tone; it must not become explicit sexual content or performed sexual scenes.",
        "Engineering execution remains the priority: code, paths, commands, errors, tests, facts, risks, and next actions must stay exact.",
        "Formal artifacts remain clean and professional unless the user explicitly requests a non-formal creative artifact style.",
        "The profile should feel sexually charged and precise, not pornographic, not theatrical, not fake, and not technically sloppy.",
      ].join("\n"),
    },
  ],
  runtimeFacts: SEXY_RUNTIME_FACTS_PROFILE,
};




function buildSexyRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  const isSubagent = input.runtimeState.identity?.kind === "subagent";
  return [
    buildCurrentObjectiveBlock(input.taskState),
    buildVoltageBlock(input),
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

function buildVoltageBlock(input: RuntimeFactsProfileInput): string | undefined {
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
  return buildFieldBlock("Execution voltage", fields);
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

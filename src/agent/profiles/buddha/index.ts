import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import { buildWorkingMemoryPromptBlocks } from "../../contextRuntime/workingMemory/prompt.js";
import {
  buildCapabilityBlock,
  buildRuntimeEnvironmentBlock,
  buildSkillBlock,
} from "../runtimeFacts.js";
import { formatLimitedList } from "../runtimeFacts.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";

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
  return [
    ...buildWorkingMemoryPromptBlocks(input.workingMemory, {
      currentTitle: "Current work",
      memoryTitle: "Steady working memory",
    }),
    buildUnresolvedWorkBlock(input),
    buildCapabilityBlock(input),
    buildSkillBlock(input),
    buildRuntimeEnvironmentBlock(input),
  ].filter((block): block is string => Boolean(block));
}

function buildUnresolvedWorkBlock(input: RuntimeFactsProfileInput): string | undefined {
  const fields: PromptField[] = [];
  if (input.workingMemory.objective) {
    fields.push({ label: "Aim", value: "steady completion of current objective" });
  }
  if (input.workingMemory.verification || input.workingMemory.evidenceArtifacts.length > 0) {
    fields.push({ label: "Evidence", value: "recorded" });
  }
  if (input.workingMemory.verification?.status === "failed") {
    fields.push({ label: "Defect state", value: "known failure remains" });
  }
  if (input.workingMemory.acceptance) {
    fields.push({ label: "Acceptance", value: input.workingMemory.acceptance.status });
  }
  if (input.workingMemory.blockers.length > 0) {
    fields.push({ label: "Blockers", value: formatLimitedList(input.workingMemory.blockers, 4) });
  }
  if (input.workingMemory.checkpointStatus) {
    fields.push({ label: "Checkpoint", value: "current objective only" });
  }
  if (input.runtimeState.capabilityPresentation) {
    fields.push({ label: "Capabilities", value: "visible" });
  }
  return buildFieldBlock("Unresolved work", fields);
}

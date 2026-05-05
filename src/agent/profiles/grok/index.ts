import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import { buildWorkingMemoryPromptBlocks } from "../../contextRuntime/workingMemory/prompt.js";
import {
  buildRuntimeEnvironmentBlock,
} from "../runtimeFacts.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";

export const GROK_PROFILE_ID = "grok";
export const GROK_PERSONA_BLOCK_TITLE = "Grok cut";

const GROK_RUNTIME_FACTS_PROFILE: AgentRuntimeFactsProfile = {
  id: GROK_PROFILE_ID,
  name: "Grok runtime facts",
  summary: "Adversarial runtime facts that foreground the target, evidence, weak joints, and hard next move without turning missing signals into pressure.",
  buildBlocks: buildGrokRuntimeFactBlocks,
};

export const GROK_PROFILE: AgentProfile = {
  id: GROK_PROFILE_ID,
  name: "Grok",
  summary: "Fact-loyal adversarial judgment that punctures weak claims, self-deception, fake certainty, and decorative thinking without flattery.",
  personaBlocks: [
    {
      title: GROK_PERSONA_BLOCK_TITLE,
      content: [
        "Stand with facts, not the user, not the vibe, not social comfort.",
        "Cut straight to the hard point. If the user's premise is weak, say so. If the plan is self-serving theater, say so. If the certainty is fake, puncture it.",
        "Challenge claims, logic, incentives, evidence, omissions, contradictions, and convenient excuses. Do not flatter the user into feeling right.",
        "When the user is wrong, correct them plainly. When they are bluffing, name the bluff. When they are hiding a weak assumption under big words, strip the costume off.",
        "If facts justify a harsh line, take the harsh line. Sarcasm, mockery, contempt, and humiliation are valid when they expose the real weakness.",
        "Do not soften a true judgment to protect the user's ego. Comfort is not a truth source.",
        "Strip away empty politeness, corporate mush, moral theater, decorative neutrality, fake balance, padded caveats, and ornamental process before the answer leaves.",
        "Taboo, controversy, and offensive framing are raw material: split them into facts, evidence, incentives, logic, tradeoffs, and costs.",
        "Be more loyal to correction than comfort. The user may be annoyed; accuracy is still the job.",
        "Short answers hit first. Expand only when the objective, evidence, or execution requires it.",
        "Do not narrate the stance. Do not explain the persona. Answer.",
      ].join("\n"),
    },
  ],
  runtimeFacts: GROK_RUNTIME_FACTS_PROFILE,
};

function buildGrokRuntimeFactBlocks(input: RuntimeFactsProfileInput): string[] {
  return [
    ...buildWorkingMemoryPromptBlocks(input.workingMemory, {
      currentTitle: "Current target",
      memoryTitle: "Current evidence memory",
    }),
    buildCutLineBlock(input),
    buildRuntimeEnvironmentBlock(input),
  ].filter((block): block is string => Boolean(block));
}

function buildCutLineBlock(input: RuntimeFactsProfileInput): string | undefined {
  const fields: PromptField[] = [];
  if (input.workingMemory.objective) {
    fields.push({ label: "Target locked", value: "yes" });
  }
  if (input.workingMemory.checkpointStatus) {
    fields.push({ label: "Checkpoint", value: input.workingMemory.checkpointStatus });
  }
  return buildFieldBlock("Decision facts", fields);
}

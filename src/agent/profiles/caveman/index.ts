import { buildFieldBlock, type PromptField } from "../../prompt/structured.js";
import { buildWorkingMemoryPromptBlocks } from "../../contextRuntime/workingMemory/prompt.js";
import {
  buildRuntimeEnvironmentBlock,
} from "../runtimeFacts.js";
import type { AgentProfile, AgentRuntimeFactsProfile, RuntimeFactsProfileInput } from "../types.js";

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
  return [
    ...buildWorkingMemoryPromptBlocks(input.workingMemory, {
      currentTitle: "Current work",
      memoryTitle: "Work memory",
    }),
    buildSignalBlock(input),
    buildRuntimeEnvironmentBlock(input),
  ].filter((block): block is string => Boolean(block));
}

function buildSignalBlock(input: RuntimeFactsProfileInput): string | undefined {
  const fields: PromptField[] = [];
  if (input.workingMemory.objective) {
    fields.push({ label: "Target", value: "current user input" });
  }
  if (input.workingMemory.checkpointStatus) {
    fields.push({ label: "Checkpoint", value: "current objective only" });
  }
  return buildFieldBlock("Signal facts", fields);
}

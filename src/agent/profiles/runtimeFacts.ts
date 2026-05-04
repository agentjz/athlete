import { formatSkillPromptBlock } from "../../capabilities/skills/prompt.js";
import { formatPromptBlock } from "../prompt/format.js";
import { buildFieldBlock, formatLimitedList } from "../prompt/structured.js";
import type { RuntimeFactsProfileInput } from "./types.js";

export function buildRuntimeEnvironmentBlock(input: RuntimeFactsProfileInput): string | undefined {
  return buildFieldBlock("Runtime environment", [
    { label: "Current working directory", value: input.cwd },
    { label: "Task file boundary", value: "Work from the current working directory unless the user explicitly names another path." },
    { label: "Model", value: input.config.model },
    { label: "Thinking", value: input.config.thinking ?? "provider default" },
    { label: "Reasoning effort", value: input.config.reasoningEffort ?? "provider default" },
    { label: "Date", value: new Date().toISOString() },
  ]);
}

export function buildCapabilityBlock(input: RuntimeFactsProfileInput): string | undefined {
  if (input.runtimeState.identity?.kind === "subagent") {
    return undefined;
  }

  return input.runtimeState.capabilityPresentation
    ? formatPromptBlock("Capability presentation layer", input.runtimeState.capabilityPresentation)
    : undefined;
}

export function buildSkillBlock(input: RuntimeFactsProfileInput): string | undefined {
  const content = formatSkillPromptBlock(input.projectContext.skills, input.skillRuntimeState).trim();
  if (!content || content === "- No project skills discovered.") {
    return input.projectContext.skills.length > 0
      ? formatPromptBlock("Skill runtime hints", content)
      : undefined;
  }

  return formatPromptBlock("Skill runtime hints", content);
}

export { formatLimitedList };

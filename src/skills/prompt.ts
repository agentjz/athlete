import type { LoadedSkill, SkillRuntimeState } from "./types.js";

export function formatSkillPromptBlock(
  discoveredSkills: LoadedSkill[],
  runtimeState: SkillRuntimeState,
): string {
  if (discoveredSkills.length === 0) {
    return "- No project skills discovered.";
  }

  const lines: string[] = [];
  const loaded = uniqueSkills(runtimeState.loadedSkills);
  const selected = uniqueSkills([
    ...runtimeState.requiredSkills,
    ...runtimeState.suggestedSkills,
    ...runtimeState.namedSkills,
  ]);
  const missingRequired = uniqueSkills(runtimeState.missingRequiredSkills);

  if (loaded.length > 0) {
    lines.push(`- Loaded now: ${loaded.map((skill) => skill.name).join(", ")}`);
  }

  if (selected.length > 0) {
    lines.push(
      ...selected
        .slice(0, 6)
        .map((skill) => `- Turn match: ${describeTurnSkill(skill, runtimeState)}`),
    );

    if (selected.length > 6) {
      lines.push(`- Turn match: +${selected.length - 6} more relevant skill(s)`);
    }
  }

  if (missingRequired.length > 0) {
    lines.push(`- Missing required: ${missingRequired.map((skill) => skill.name).join(", ")}`);
    lines.push("- Load the missing required skills with load_skill before using that workflow.");
  }

  if (lines.length === 0) {
    return "- No skill is loaded or selected for this turn. Relevant project skills can still be loaded on demand.";
  }

  return lines.join("\n");
}

function describeTurnSkill(skill: LoadedSkill, runtimeState: SkillRuntimeState): string {
  const tags: string[] = [];
  const match = runtimeState.matches.find((entry) => entry.skill.name === skill.name);

  if (runtimeState.requiredSkills.some((entry) => entry.name === skill.name)) {
    tags.push("required");
  } else if (runtimeState.suggestedSkills.some((entry) => entry.name === skill.name)) {
    tags.push("suggested");
  }

  if (runtimeState.namedSkills.some((entry) => entry.name === skill.name)) {
    tags.push("named");
  }
  if (runtimeState.loadedSkills.some((entry) => entry.name === skill.name)) {
    tags.push("loaded");
  }

  const reasons = (match?.matchedBy ?? []).filter((reason) => reason !== "default" && reason !== "name");
  if (reasons.length > 0) {
    tags.push(`via ${reasons.join("/")}`);
  }

  return tags.length > 0 ? `${skill.name} [${tags.join("; ")}]` : skill.name;
}

function uniqueSkills(skills: LoadedSkill[]): LoadedSkill[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    if (seen.has(skill.name)) {
      return false;
    }

    seen.add(skill.name);
    return true;
  });
}

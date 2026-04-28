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
  const available = uniqueSkills(discoveredSkills);

  if (loaded.length > 0) {
    lines.push(`- Loaded now: ${loaded.map((skill) => skill.name).join(", ")}`);
  }

  if (available.length > 0) {
    lines.push(`- Skill index: ${formatSkillIndex(available)}`);
    lines.push("- Skill bodies are available only through explicit load_skill calls.");
  }

  if (lines.length === 0) {
    return "- Skill index is empty.";
  }

  return lines.join("\n");
}

function formatSkillIndex(skills: LoadedSkill[]): string {
  const names = skills.map((skill) => skill.name).slice(0, 12);
  const extra = skills.length - names.length;
  return extra > 0 ? `${names.join(", ")} (+${extra} more)` : names.join(", ");
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

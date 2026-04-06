import type { LoadedSkill, SkillRuntimeState } from "./types.js";

export function formatSkillPromptBlock(
  discoveredSkills: LoadedSkill[],
  runtimeState: SkillRuntimeState,
): string {
  const lines = [
    "Loaded skills:",
    formatSkillLines(runtimeState.loadedSkills, "loaded"),
    "",
    "Selected skills for this turn:",
    formatSkillLines(
      [...runtimeState.requiredSkills, ...runtimeState.suggestedSkills, ...runtimeState.namedSkills],
      "selected",
    ),
    "",
    "Required skills still missing:",
    runtimeState.missingRequiredSkills.length > 0
      ? runtimeState.missingRequiredSkills.map((skill) => `- ${skill.name}`).join("\n")
      : "- none",
    "",
    "Discovered project skill catalog:",
    formatSkillLines(discoveredSkills, "catalog"),
  ];

  return lines.join("\n");
}

function formatSkillLines(skills: LoadedSkill[], mode: "loaded" | "selected" | "catalog"): string {
  if (skills.length === 0) {
    return "- none";
  }

  return skills.map((skill) => formatSkillLine(skill, mode)).join("\n");
}

function formatSkillLine(skill: LoadedSkill, mode: "loaded" | "selected" | "catalog"): string {
  const scopes = [
    `load=${skill.loadMode}`,
    skill.agentKinds.length > 0 ? `agents=${skill.agentKinds.join("/")}` : "",
    skill.roles.length > 0 ? `roles=${skill.roles.join("/")}` : "",
    skill.taskTypes.length > 0 ? `tasks=${skill.taskTypes.join("/")}` : "",
    skill.scenes.length > 0 ? `scenes=${skill.scenes.join("/")}` : "",
    skill.tools.required.length > 0 ? `requires=${skill.tools.required.join("/")}` : "",
    skill.tools.incompatible.length > 0 ? `incompatible=${skill.tools.incompatible.join("/")}` : "",
  ].filter(Boolean);
  const triggerText =
    skill.triggers.keywords.length > 0 ? ` triggers=${skill.triggers.keywords.join("/")}` : "";
  const prefix = mode === "loaded" ? "- [loaded]" : mode === "selected" ? "- [turn]" : "-";

  return `${prefix} ${skill.name}: ${skill.description} (${scopes.join(", ")})${triggerText}`;
}

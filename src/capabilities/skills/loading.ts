import type { LoadedSkill, LoadedSkillPayload, SkillSummary } from "./types.js";

export function createLoadedSkillToolResult(skill: LoadedSkill): string {
  return JSON.stringify(buildLoadedSkillPayload(skill), null, 2);
}

export function buildLoadedSkillPayload(skill: LoadedSkill): LoadedSkillPayload {
  return {
    ok: true,
    skill: buildSkillSummary(skill),
    body: skill.body,
  };
}

export function readLoadedSkillName(output: string | null | undefined): string | undefined {
  if (typeof output === "string") {
    return readLoadedSkillNameFromJson(output);
  }

  return undefined;
}

function buildSkillSummary(skill: LoadedSkill): SkillSummary {
  const {
    absolutePath: _absolutePath,
    body: _body,
    ...summary
  } = skill;

  return summary;
}

function readLoadedSkillNameFromJson(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as { skill?: { name?: unknown } };
    return typeof parsed?.skill?.name === "string" ? parsed.skill.name : undefined;
  } catch {
    return undefined;
  }
}

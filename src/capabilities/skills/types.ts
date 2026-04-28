export const SKILL_SCHEMA_VERSION = "skill";
export const SKILL_AGENT_KINDS = ["lead", "teammate", "subagent"] as const;

export type SkillSchemaVersion = typeof SKILL_SCHEMA_VERSION;
export type SkillAgentKind = (typeof SKILL_AGENT_KINDS)[number];

export interface SkillTriggerSet {
  keywords: string[];
  patterns: string[];
}

export interface SkillToolConstraints {
  required: string[];
  optional: string[];
  incompatible: string[];
}

export interface LoadedSkill {
  schemaVersion: SkillSchemaVersion;
  version: string;
  name: string;
  description: string;
  path: string;
  absolutePath: string;
  body: string;
  agentKinds: SkillAgentKind[];
  roles: string[];
  taskTypes: string[];
  scenes: string[];
  triggers: SkillTriggerSet;
  tools: SkillToolConstraints;
}

export interface SkillRuntimeState {
  loadedSkills: LoadedSkill[];
  loadedSkillNames: Set<string>;
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;

export interface LoadedSkillPayload {
  ok: true;
  skill: SkillSummary;
  body: string;
}

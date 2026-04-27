export const SKILL_SCHEMA_VERSION = "skill.v1";
export const SKILL_LOAD_MODES = ["manual", "suggested", "required"] as const;
export const SKILL_AGENT_KINDS = ["lead", "teammate", "subagent"] as const;

export type SkillSchemaVersion = typeof SKILL_SCHEMA_VERSION;
export type SkillLoadMode = (typeof SKILL_LOAD_MODES)[number];
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
  loadMode: SkillLoadMode;
  agentKinds: SkillAgentKind[];
  roles: string[];
  taskTypes: string[];
  scenes: string[];
  triggers: SkillTriggerSet;
  tools: SkillToolConstraints;
}

export interface SkillIdentity {
  kind: SkillAgentKind;
  name: string;
  role?: string;
  teamName?: string;
}

export type SkillMatchBlockReason =
  | "agent_kind"
  | "role"
  | "task_type"
  | "scene"
  | "required_tools"
  | "incompatible_tools"
  | "trigger";

export type SkillMatchReason = "name" | "task_type" | "scene" | "trigger" | "default";

export interface SkillMatchResult {
  skill: LoadedSkill;
  applicable: boolean;
  named: boolean;
  loaded: boolean;
  blockedBy: SkillMatchBlockReason[];
  matchedBy: SkillMatchReason[];
}

export interface SkillSelectionInput {
  skills: LoadedSkill[];
  input?: string;
  identity: SkillIdentity;
  objective?: string;
  taskSummary?: string;
  availableToolNames: string[];
  loadedSkillNames?: ReadonlySet<string>;
}

export interface SkillSelectionResult {
  matches: SkillMatchResult[];
  namedSkills: LoadedSkill[];
  applicableSkills: LoadedSkill[];
  suggestedSkills: LoadedSkill[];
  requiredSkills: LoadedSkill[];
  missingRequiredSkills: LoadedSkill[];
  loadedSkills: LoadedSkill[];
}

export type SkillSummary = Omit<LoadedSkill, "absolutePath" | "body">;

export interface LoadedSkillPayload {
  ok: true;
  skill: SkillSummary;
  body: string;
}

export interface SkillRuntimeState extends SkillSelectionResult {
  loadedSkillNames: Set<string>;
}

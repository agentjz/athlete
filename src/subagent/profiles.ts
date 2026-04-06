import type { AgentMode } from "../types.js";

export type SubagentType = "explore" | "plan" | "code";

export interface SubagentProfile {
  type: SubagentType;
  description: string;
  mode: AgentMode;
  toolNames: readonly string[];
  assignmentPreamble: string;
}

const READ_ONLY_SUBAGENT_TOOLS = [
  "list_files",
  "read_file",
  "read_docx",
  "read_spreadsheet",
  "search_files",
  "load_skill",
] as const;

const CODE_SUBAGENT_TOOLS = [
  ...READ_ONLY_SUBAGENT_TOOLS,
  "write_file",
  "write_docx",
  "edit_docx",
  "edit_file",
  "apply_patch",
  "undo_last_change",
  "run_shell",
] as const;

export const SUBAGENT_PROFILES: Record<SubagentType, SubagentProfile> = {
  explore: {
    type: "explore",
    description: "Read-only exploration for finding files, tracing behavior, and reporting concrete facts.",
    mode: "read-only",
    toolNames: READ_ONLY_SUBAGENT_TOOLS,
    assignmentPreamble:
      "Explore the codebase in read-only mode. Gather the minimum concrete evidence needed, stay narrow, and avoid proposing unrelated changes.",
  },
  plan: {
    type: "plan",
    description: "Read-only design analysis for implementation planning and dependency discovery.",
    mode: "read-only",
    toolNames: READ_ONLY_SUBAGENT_TOOLS,
    assignmentPreamble:
      "Analyze the current code and produce an implementation-ready plan grounded in existing architecture. Do not modify files.",
  },
  code: {
    type: "code",
    description: "Implementation-focused coding agent with edit and validation tools, but no coordination tools.",
    mode: "agent",
    toolNames: CODE_SUBAGENT_TOOLS,
    assignmentPreamble:
      "Implement the delegated change directly and keep the solution surgical. Validate targeted behavior when feasible before handing back the result.",
  },
};

export function listSubagentTypes(): SubagentType[] {
  return Object.keys(SUBAGENT_PROFILES) as SubagentType[];
}

export function getSubagentProfile(agentType: string): SubagentProfile {
  const normalized = agentType.trim().toLowerCase() as SubagentType;
  const profile = SUBAGENT_PROFILES[normalized];
  if (!profile) {
    throw new Error(`Unknown subagent type: ${agentType}`);
  }

  return profile;
}

export function resolveSubagentMode(profile: SubagentProfile, parentMode: AgentMode): AgentMode {
  if (profile.mode === "agent" && parentMode !== "agent") {
    throw new Error(`The '${profile.type}' subagent requires agent mode.`);
  }

  return profile.mode;
}

export function buildSubagentAssignment(
  description: string,
  prompt: string,
  profile: SubagentProfile,
): string {
  return [
    `Delegated task: ${description}`,
    profile.assignmentPreamble,
    "Detailed instructions:",
    prompt.trim(),
    "Return a concise final answer for the parent agent. Focus on findings, changes, and any validation you performed.",
  ].join("\n\n");
}

export function buildSubagentTypeSummary(): string {
  return listSubagentTypes()
    .map((type) => `- ${type}: ${SUBAGENT_PROFILES[type].description}`)
    .join("\n");
}

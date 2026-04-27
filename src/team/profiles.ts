import { createAssignmentContract, formatAssignmentContract } from "../protocol/assignment.js";
import { createCapabilityProfile, formatCapabilityProfile, type CapabilityProfile } from "../protocol/capability.js";
import { formatCloseoutInstruction } from "../protocol/closeout.js";

export const TEAM_CAPABILITY_PROFILE = createCapabilityProfile({
  kind: "team",
  id: "teammate",
  name: "Lead-selected teammate",
  description: "A teammate is a longer-running collaborator selected and instructed by Lead for a concrete task slice.",
  bestFor: ["parallel research", "independent review", "long-running collaboration"],
  notFor: ["automatic dispatch", "final user-facing closeout without Lead review"],
  inputSchema: "AssignmentContract created by Lead through spawn_teammate",
  outputSchema: "CloseoutContract returned to Lead",
  budgetPolicy: "High cost; use when parallel perspective or longer collaboration is worth it.",
  tools: [],
  cost: "high",
  extensionPoint: "src/team/profiles.ts",
});

export function getTeamCapabilityProfile(): CapabilityProfile {
  return TEAM_CAPABILITY_PROFILE;
}

export function formatTeamCapabilityProfile(): string {
  return formatCapabilityProfile(TEAM_CAPABILITY_PROFILE);
}

export function buildTeammateAssignment(input: {
  name: string;
  role: string;
  objective: string;
  scope: string;
  expectedOutput: string;
}): string {
  const assignment = createAssignmentContract({
    capabilityId: TEAM_CAPABILITY_PROFILE.id,
    objective: input.objective,
    scope: input.scope,
    expectedOutput: input.expectedOutput,
    createdBy: "lead",
  });
  return [
    formatTeamCapabilityProfile(),
    formatAssignmentContract(assignment),
    `teammate: ${input.name}`,
    `role: ${input.role}`,
    "Detailed instructions:",
    input.objective.trim(),
    formatCloseoutInstruction(),
  ].join("\n\n");
}

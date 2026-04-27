import { createAssignmentContract, formatAssignmentContract } from "../../protocol/assignment.js";
import { createCapabilityProfile } from "../../protocol/capability.js";
import { formatCloseoutInstruction } from "../../protocol/closeout.js";
import { createCapabilityPackage, formatCapabilityPackageForLead, type CapabilityPackage } from "../../protocol/package.js";

const TEAM_CAPABILITY_PROFILE = createCapabilityProfile({
  kind: "team",
  id: "team.teammate",
  name: "Lead-selected teammate",
  description: "A teammate is a longer-running collaborator selected and instructed by Lead for a concrete task slice.",
  bestFor: ["parallel research", "independent review", "long-running collaboration"],
  notFor: ["automatic dispatch", "final user-facing closeout without Lead review"],
  inputSchema: "AssignmentContract created by Lead through spawn_teammate",
  outputSchema: "CloseoutContract returned to Lead",
  budgetPolicy: "High cost; use when parallel perspective or longer collaboration is worth it.",
  tools: [],
  cost: "high",
  extensionPoint: "src/capabilities/team/profiles.ts",
});

export function getTeamCapabilityPackage(): CapabilityPackage {
  return createCapabilityPackage({
    profile: TEAM_CAPABILITY_PROFILE,
    source: {
      kind: "team",
      id: "team.teammate",
      path: "src/capabilities/team/profiles.ts",
      builtIn: true,
    },
    adapter: {
      kind: "agent",
      id: "team.teammate.adapter",
      description: "Adapts Lead-selected teammates into the generic capability package contract.",
    },
    runnerType: "worker",
    selectionHint: "Use when Lead wants a longer-running collaborator with a named role and independent context.",
  });
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
    formatCapabilityPackageForLead(getTeamCapabilityPackage()),
    formatAssignmentContract(assignment),
    `teammate: ${input.name}`,
    `role: ${input.role}`,
    "Detailed instructions:",
    input.objective.trim(),
    formatCloseoutInstruction(),
  ].join("\n\n");
}

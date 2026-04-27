import { createCapabilityProfile, formatCapabilityProfile, type CapabilityProfile } from "../protocol/capability.js";

export interface WorkflowProfile extends CapabilityProfile {
  kind: "workflow";
  decisionOwner: "lead";
}

export const BASE_WORKFLOW_PROFILE: WorkflowProfile = {
  ...createCapabilityProfile({
    kind: "workflow",
    id: "manual-lead-selected",
    name: "Manual Lead-selected workflow",
    description: "A workflow is a reusable work method offered to Lead; it never dispatches workers by itself.",
    bestFor: ["repeatable method", "multi-step work pattern", "Lead-selected loop skeleton"],
    notFor: ["machine-owned strategy", "automatic dispatch", "bypassing Lead review between steps"],
    inputSchema: "AssignmentContract selected by Lead",
    outputSchema: "CloseoutContract at each workflow handoff",
    budgetPolicy: "Medium cost; use when a repeatable method improves evidence and control.",
    tools: [],
    cost: "medium",
    extensionPoint: "src/workflows/registry.ts",
  }),
  kind: "workflow",
  decisionOwner: "lead",
};

export function listWorkflowProfiles(): WorkflowProfile[] {
  return [BASE_WORKFLOW_PROFILE];
}

export function formatWorkflowProfilesForPrompt(): string {
  return listWorkflowProfiles()
    .map((profile) => [
      formatCapabilityProfile(profile),
      `  decisionOwner: ${profile.decisionOwner}`,
    ].join("\n"))
    .join("\n");
}

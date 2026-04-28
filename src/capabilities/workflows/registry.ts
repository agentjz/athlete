import { createCapabilityProfile, type CapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";

export interface WorkflowProfile extends CapabilityProfile {
  kind: "workflow";
  decisionOwner: "lead";
}

const BASE_WORKFLOW_PROFILE: WorkflowProfile = {
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
    extensionPoint: "src/capabilities/workflows/registry.ts",
  }),
  kind: "workflow",
  decisionOwner: "lead",
};

function listWorkflowProfiles(): WorkflowProfile[] {
  return [BASE_WORKFLOW_PROFILE];
}

export function listWorkflowCapabilityPackages(): CapabilityPackage[] {
  return listWorkflowProfiles().map((profile) => createCapabilityPackage({
    packageId: `workflow.${profile.id}`,
    profile,
    source: {
      kind: "workflow",
      id: `workflow.${profile.id}`,
      path: "src/capabilities/workflows/registry.ts",
      builtIn: true,
    },
    adapter: {
      kind: "workflow",
      id: `workflow.${profile.id}.adapter`,
      description: "Adapts Lead-selected workflow methods into the generic capability package contract.",
    },
    runnerType: "workflow",
    availability: profile.description,
  }));
}

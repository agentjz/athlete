import { createAssignmentContract, formatAssignmentContract } from "../../protocol/assignment.js";
import { createCapabilityProfile, type CapabilityProfile, type CapabilityCost } from "../../protocol/capability.js";
import { formatCloseoutInstruction } from "../../protocol/closeout.js";
import { createCapabilityPackage, formatCapabilityPackageForLead, type CapabilityPackage } from "../../protocol/package.js";
import { executionPort } from "../ports.js";

export type SubagentType = "explore" | "plan" | "code";

export interface SubagentProfile {
  type: SubagentType;
  description: string;
  toolNames: readonly string[];
  assignmentPreamble: string;
  cost: CapabilityCost;
}

const READ_ONLY_SUBAGENT_TOOLS = [
  "read",
  "mineru_pdf_read",
  "mineru_image_read",
  "mineru_doc_read",
  "mineru_ppt_read",
  "read_docx",
  "read_spreadsheet",
  "load_skill",
  "bash",
] as const;

const CODE_SUBAGENT_TOOLS = [
  ...READ_ONLY_SUBAGENT_TOOLS,
  "write",
  "write_docx",
  "edit_docx",
  "edit",
  "undo_last_change",
] as const;

export const SUBAGENT_PROFILES: Record<SubagentType, SubagentProfile> = {
  explore: {
    type: "explore",
    description: "Exploration for tracing behavior and reporting concrete facts.",
    toolNames: READ_ONLY_SUBAGENT_TOOLS,
    cost: "low",
    assignmentPreamble:
      "Explore the codebase. Gather the minimum concrete evidence needed, stay narrow, and avoid proposing unrelated changes.",
  },
  plan: {
    type: "plan",
    description: "Design analysis for implementation planning and dependency discovery.",
    toolNames: READ_ONLY_SUBAGENT_TOOLS,
    cost: "medium",
    assignmentPreamble:
      "Analyze the current code and produce an implementation-ready plan grounded in existing architecture. Do not modify files.",
  },
  code: {
    type: "code",
    description: "Implementation-focused coding agent with read, edit, write, and bash tools, but no coordination tools.",
    toolNames: CODE_SUBAGENT_TOOLS,
    cost: "high",
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

export function buildSubagentAssignment(
  description: string,
  prompt: string,
  profile: SubagentProfile,
  options: {
    assignment?: ReturnType<typeof createAssignmentContract>;
    scope?: string;
    expectedOutput?: string;
  } = {},
): string {
  const assignment = options.assignment ?? createAssignmentContract({
    capabilityId: `subagent.${profile.type}`,
    objective: prompt,
    scope: options.scope ?? description,
    expectedOutput: options.expectedOutput ?? "Return a CloseoutContract with evidence, verification, risks, and next Lead suggestion.",
    createdBy: "lead",
  });
  return [
    `Delegated task: ${description}`,
    formatCapabilityPackageForLead(toSubagentCapabilityPackage(profile)),
    formatAssignmentContract(assignment),
    profile.assignmentPreamble,
    "Detailed instructions:",
    prompt.trim(),
    formatCloseoutInstruction(),
  ].join("\n\n");
}

export function buildSubagentTypeSummary(): string {
  return listSubagentTypes()
    .map((type) => formatCapabilityPackageForLead(toSubagentCapabilityPackage(SUBAGENT_PROFILES[type])))
    .join("\n");
}

export function listSubagentCapabilityPackages(): CapabilityPackage[] {
  return listSubagentTypes().map((type) => toSubagentCapabilityPackage(SUBAGENT_PROFILES[type]));
}

function toSubagentCapabilityProfile(profile: SubagentProfile): CapabilityProfile {
  return createCapabilityProfile({
    kind: "subagent",
    id: `subagent.${profile.type}`,
    name: `${profile.type} subagent`,
    description: profile.description,
    bestFor: [profile.assignmentPreamble],
    notFor: ["owning final user closeout", "dispatching other agents", "changing Lead strategy"],
    inputSchema: "AssignmentContract created by Lead through task",
    outputSchema: "CloseoutContract returned to Lead",
    budgetPolicy: `${profile.cost} cost subagent profile; Lead chooses when the isolated context is worth it.`,
    tools: profile.toolNames,
    cost: profile.cost,
    extensionPoint: "src/capabilities/subagent/profiles.ts",
  });
}

export function toSubagentCapabilityPackage(profile: SubagentProfile): CapabilityPackage {
  const capabilityProfile = toSubagentCapabilityProfile(profile);
  return createCapabilityPackage({
    packageId: capabilityProfile.id,
    profile: capabilityProfile,
    source: {
      kind: "subagent",
      id: capabilityProfile.id,
      path: "src/capabilities/subagent/profiles.ts",
      builtIn: true,
    },
    adapter: {
      kind: "agent",
      id: `${capabilityProfile.id}.adapter`,
      description: "Docks a subagent profile into the capability port.",
    },
    port: executionPort("worker", {
      runner: {
        invocation: "Lead calls task with AssignmentContract fields; runtime launches the selected subagent profile.",
      },
      permissionBoundary: {
        world: "Assigned subagent execution lane",
        autonomy: "Subagent owns its bounded assignment and returns a closeout; Lead owns integration.",
        read: ["assigned context", "profile-allowed tools"],
        write: profile.type === "code"
          ? ["assigned files through profile-allowed write tools", "execution artifacts", "closeout records"]
          : ["execution artifacts", "closeout records"],
        forbidden: ["final user closeout ownership", "machine-selected dispatch", "coordination tool escape"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "subagent",
        streams: ["progress", "closeout"],
      },
      artifacts: [
        {
          kind: "execution",
          name: "subagent-execution",
          description: "Execution record for the subagent assignment.",
          required: true,
        },
        {
          kind: "observation",
          name: "subagent-evidence",
          description: "Evidence and result summary returned by the subagent.",
          required: false,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["evidence", "verification when performed", "risks"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: profile.description,
  });
}

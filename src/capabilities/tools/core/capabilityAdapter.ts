import { createCapabilityProfile } from "../../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../../protocol/package.js";
import type { ToolGovernanceSpecialty, ToolRegistryEntry, ToolOriginKind } from "./types.js";

export function listToolCapabilityPackages(entries: readonly ToolRegistryEntry[] = []): CapabilityPackage[] {
  return groupToolEntries(entries).map((group) => {
    const kind = group.sourceKind === "mcp" ? "mcp" : "tool";
    const profile = createCapabilityProfile({
      kind,
      id: `${kind}.${group.sourceKind}.${group.specialty}.${group.mutation}`,
      name: `${group.sourceKind} ${group.specialty} ${group.mutation} tools`,
      description: `Tool capability group for ${group.specialty}/${group.mutation} from ${group.sourceKind}.`,
      bestFor: [`Lead-selected ${group.specialty} operations`, `${group.mutation} tool calls`],
      notFor: ["automatic route changes", "machine-owned strategy", "bypassing tool governance"],
      inputSchema: "Tool call arguments inside an Assignment-led turn",
      outputSchema: "ToolExecutionResult plus optional ArtifactRef / CloseoutContract evidence",
      budgetPolicy: `${group.highestRisk} risk tool group; Lead chooses whether to call tools.`,
      tools: group.toolNames,
      cost: group.highestRisk === "high" ? "high" : group.highestRisk === "medium" ? "medium" : "low",
      extensionPoint: `tool-registry:${group.sourceKind}:${group.specialty}`,
    });

    return createCapabilityPackage({
      packageId: profile.id,
      profile,
      source: {
        kind,
        id: `${group.sourceKind}.${group.specialty}.${group.mutation}`,
        builtIn: group.sourceKind === "builtin",
      },
      adapter: {
        kind,
        id: `${profile.id}.adapter`,
        description: "Adapts runtime tool registry entries into capability package groups.",
      },
      runnerType: group.sourceKind === "mcp" ? "mcp" : "tool",
      runner: {
        createsExecution: false,
        emitsWakeSignal: false,
      },
      availability: `${group.specialty} ${group.mutation} tool surface from ${group.sourceKind}.`,
    });
  });
}

interface ToolEntryGroup {
  sourceKind: ToolOriginKind;
  specialty: ToolGovernanceSpecialty;
  mutation: string;
  highestRisk: "low" | "medium" | "high";
  toolNames: string[];
}

function groupToolEntries(entries: readonly ToolRegistryEntry[]): ToolEntryGroup[] {
  const groups = new Map<string, ToolEntryGroup>();
  for (const entry of entries) {
    const key = `${entry.origin.kind}:${entry.governance.specialty}:${entry.governance.mutation}`;
    const existing = groups.get(key) ?? {
      sourceKind: entry.origin.kind,
      specialty: entry.governance.specialty,
      mutation: entry.governance.mutation,
      highestRisk: "low" as const,
      toolNames: [],
    };
    existing.toolNames.push(entry.name);
    existing.highestRisk = maxRisk(existing.highestRisk, entry.governance.risk);
    groups.set(key, existing);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    toolNames: group.toolNames.sort(),
  }));
}

function maxRisk(left: "low" | "medium" | "high", right: "low" | "medium" | "high"): "low" | "medium" | "high" {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[right] > rank[left] ? right : left;
}

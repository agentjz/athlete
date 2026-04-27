import { getBackgroundCapabilityPackage } from "./background/capabilityAdapter.js";
import { listMcpCapabilityPackages } from "./mcp/capabilityAdapter.js";
import { listSkillCapabilityPackages } from "./skills/capabilityAdapter.js";
import type { LoadedSkill } from "./skills/types.js";
import { listSubagentCapabilityPackages } from "./subagent/profiles.js";
import { getTeamCapabilityPackage } from "./team/profiles.js";
import { listToolCapabilityPackages } from "./tools/core/capabilityAdapter.js";
import type { ToolRegistryEntry } from "./tools/core/types.js";
import { listWorkflowCapabilityPackages } from "./workflows/registry.js";
import { CapabilityRegistry, formatCapabilityRegistryForLead, type CapabilityPackageProvider } from "../protocol/registry.js";
import type { CapabilityRegistrySummaryOptions } from "../protocol/summary.js";
import type { RuntimeConfig } from "../types.js";

export interface RuntimeCapabilityInput {
  skills?: readonly LoadedSkill[];
  toolEntries?: readonly ToolRegistryEntry[];
  mcpConfig?: RuntimeConfig["mcp"];
}

export function listRuntimeCapabilityPackageProviders(
  input: RuntimeCapabilityInput = {},
): CapabilityPackageProvider[] {
  return [
    { listCapabilityPackages: listSubagentCapabilityPackages },
    { listCapabilityPackages: () => [getTeamCapabilityPackage()] },
    { listCapabilityPackages: listWorkflowCapabilityPackages },
    { listCapabilityPackages: () => [getBackgroundCapabilityPackage()] },
    { listCapabilityPackages: () => input.mcpConfig ? listMcpCapabilityPackages(input.mcpConfig) : [] },
    { listCapabilityPackages: () => listSkillCapabilityPackages(input.skills ?? []) },
    { listCapabilityPackages: () => listToolCapabilityPackages(input.toolEntries ?? []) },
  ];
}

export function createRuntimeCapabilityRegistry(
  input: RuntimeCapabilityInput = {},
): CapabilityRegistry {
  return CapabilityRegistry.fromProviders(listRuntimeCapabilityPackageProviders(input));
}

export function formatRuntimeCapabilityRegistryForLead(
  input: RuntimeCapabilityInput = {},
  options: CapabilityRegistrySummaryOptions = {},
): string {
  return formatCapabilityRegistryForLead(listRuntimeCapabilityPackageProviders(input), options);
}

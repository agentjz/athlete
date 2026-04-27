export const CAPABILITY_PROTOCOL = "deadmouse.capability.v1" as const;

export type CapabilityKind = "team" | "subagent" | "workflow";
export type CapabilityCost = "low" | "medium" | "high";

export interface CapabilityProfile {
  protocol: typeof CAPABILITY_PROTOCOL;
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  bestFor: readonly string[];
  notFor: readonly string[];
  inputSchema: string;
  outputSchema: string;
  budgetPolicy: string;
  tools: readonly string[];
  cost: CapabilityCost;
  extensionPoint: string;
}

export function createCapabilityProfile(input: {
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  bestFor?: readonly string[];
  notFor?: readonly string[];
  inputSchema?: string;
  outputSchema?: string;
  budgetPolicy?: string;
  tools?: readonly string[];
  cost?: CapabilityCost;
  extensionPoint: string;
}): CapabilityProfile {
  return {
    protocol: CAPABILITY_PROTOCOL,
    kind: input.kind,
    id: normalizeProtocolId(input.id),
    name: input.name.trim() || input.id,
    description: input.description.trim(),
    bestFor: [...(input.bestFor ?? [])],
    notFor: [...(input.notFor ?? [])],
    inputSchema: input.inputSchema?.trim() || "AssignmentContract",
    outputSchema: input.outputSchema?.trim() || "CloseoutContract",
    budgetPolicy: input.budgetPolicy?.trim() || "Use only when Lead judges the capability worth its runtime cost.",
    tools: [...(input.tools ?? [])],
    cost: input.cost ?? "medium",
    extensionPoint: input.extensionPoint,
  };
}

export function formatCapabilityProfile(profile: CapabilityProfile): string {
  return [
    `- ${profile.kind}:${profile.id} (${profile.name})`,
    `  description: ${profile.description}`,
    `  bestFor: ${formatList(profile.bestFor)}`,
    `  notFor: ${formatList(profile.notFor)}`,
    `  input: ${profile.inputSchema}`,
    `  output: ${profile.outputSchema}`,
    `  budget: ${profile.budgetPolicy}`,
    `  tools: ${profile.tools.length > 0 ? profile.tools.join(", ") : "runtime-selected"}`,
    `  cost: ${profile.cost}`,
    `  extension: ${profile.extensionPoint}`,
  ].join("\n");
}

export function normalizeProtocolId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "protocol-item";
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join("; ") : "not specified";
}

export const CAPABILITY_PROTOCOL = "deadmouse.capability" as const;

export const CAPABILITY_COSTS = ["low", "medium", "high"] as const;

export type CapabilityKind = string;
export type CapabilityCost = typeof CAPABILITY_COSTS[number];

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
    budgetPolicy: input.budgetPolicy?.trim() || "Runtime cost is recorded for Lead judgment.",
    tools: [...(input.tools ?? [])],
    cost: input.cost ?? "medium",
    extensionPoint: input.extensionPoint,
  };
}

export function normalizeProtocolId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "protocol-item";
}

export function isCapabilityKind(value: unknown): value is CapabilityKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}

export function isCapabilityCost(value: unknown): value is CapabilityCost {
  return typeof value === "string" && (CAPABILITY_COSTS as readonly string[]).includes(value);
}

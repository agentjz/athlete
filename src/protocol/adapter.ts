import type { CapabilityKind } from "./capability.js";
import type { CapabilityAdapterKind, CapabilityPackage, CapabilitySourceKind } from "./package.js";

export const CAPABILITY_ADAPTER_PROTOCOL = "deadmouse.capability-adapter" as const;

export interface CapabilityAdapter {
  protocol: typeof CAPABILITY_ADAPTER_PROTOCOL;
  id: string;
  kind: CapabilityAdapterKind;
  sourceKind: CapabilitySourceKind;
  description: string;
  adapts: readonly CapabilityKind[];
  listCapabilityPackages(): CapabilityPackage[];
}

export function createStaticCapabilityAdapter(input: {
  id: string;
  kind: CapabilityAdapterKind;
  sourceKind: CapabilitySourceKind;
  description: string;
  packages: readonly CapabilityPackage[];
}): CapabilityAdapter {
  return {
    protocol: CAPABILITY_ADAPTER_PROTOCOL,
    id: input.id,
    kind: input.kind,
    sourceKind: input.sourceKind,
    description: input.description,
    adapts: [...new Set(input.packages.map((pkg) => pkg.profile.kind))],
    listCapabilityPackages: () => [...input.packages],
  };
}

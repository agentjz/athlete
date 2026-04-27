import { formatCapabilityProfile, type CapabilityProfile } from "./capability.js";

export interface CapabilityProvider {
  listCapabilityProfiles(): CapabilityProfile[];
}

export function formatCapabilityRegistryForLead(providers: readonly CapabilityProvider[]): string {
  const profiles = providers.flatMap((provider) => provider.listCapabilityProfiles());
  const header = [
    "Execution protocol platform:",
    "Capabilities are available options for Lead, not automatic machine decisions.",
    "Lead chooses whether to use them; the machine layer only exposes, executes explicit actions, records facts, waits, and enforces hard boundaries.",
    "All capabilities use AssignmentContract for dispatch and CloseoutContract for handoff.",
  ].join("\n");

  return [header, ...profiles.map(formatCapabilityProfile)].join("\n");
}

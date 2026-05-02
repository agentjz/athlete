import type { AcceptanceContract } from "../../types.js";

export function buildAcceptanceSummary(
  contract: AcceptanceContract,
  phase: string,
  pendingChecks: string[],
  stalledPhaseCount: number,
): string {
  const parts = [
    `Acceptance contract (${contract.kind}) is in phase '${phase}'.`,
  ];

  if (pendingChecks.length > 0) {
    parts.push(`Pending checks: ${pendingChecks.slice(0, 8).join(", ")}.`);
  }

  if (stalledPhaseCount > 0) {
    parts.push(`This phase has stalled for ${stalledPhaseCount} consecutive evaluation(s).`);
  }

  return parts.join(" ");
}

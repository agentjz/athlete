import type { CapabilityKind } from "./capability.js";
import { formatCapabilityPackageForLead, type CapabilityPackage } from "./package.js";

export interface CapabilityRegistrySummaryOptions {
  maxPerKind?: number;
}

export function formatCapabilityRegistrySummary(
  packages: readonly CapabilityPackage[],
  options: CapabilityRegistrySummaryOptions = {},
): string {
  const maxPerKind = Math.max(1, options.maxPerKind ?? 6);
  const grouped = groupByKind(packages);
  const lines = [
    "Capability presentation layer:",
    "This layer summarizes, orders, and de-noises available capability packages for Lead.",
    "Presentation order and summaries are options for Lead, not machine intent.",
    "Every package docks through kitty.capability-port before it can expose execution behavior.",
    "Port declares Assignment -> Execution/Progress/Artifact -> CloseoutContract -> WakeSignal behavior without driving the ecosystem internals.",
    "Lead wait behavior is derived from port runner data snapshotted into Execution records, not a concrete capability name branch.",
    "Machine permissions are fixed: expose and execute explicit assignments only; never auto-select or auto-dispatch.",
  ];

  for (const kind of [...grouped.keys()].sort()) {
    const items = grouped.get(kind) ?? [];
    lines.push(`kind=${kind} count=${items.length}`);
    for (const item of items.slice(0, maxPerKind)) {
      lines.push(formatCapabilityPackageForLead(item));
    }
    if (items.length > maxPerKind) {
      lines.push(`- ${items.length - maxPerKind} more ${kind} capability package(s) hidden from this low-noise summary.`);
    }
  }

  return lines.join("\n");
}

function groupByKind(packages: readonly CapabilityPackage[]): Map<CapabilityKind, CapabilityPackage[]> {
  const grouped = new Map<CapabilityKind, CapabilityPackage[]>();
  for (const pkg of packages) {
    const existing = grouped.get(pkg.profile.kind) ?? [];
    existing.push(pkg);
    grouped.set(pkg.profile.kind, existing);
  }
  return grouped;
}

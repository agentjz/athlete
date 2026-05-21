import type { CapabilityPackage } from "./package.js";

export interface CapabilitySurface {
  packages: readonly CapabilityPackage[];
  actionToCapabilities: ReadonlyMap<string, readonly string[]>;
}

export function createCapabilitySurface(packages: readonly CapabilityPackage[]): CapabilitySurface {
  const actionMap = new Map<string, Set<string>>();
  for (const pkg of packages) {
    for (const action of pkg.profile.tools ?? []) {
      const normalized = normalizeActionName(action);
      if (!normalized) {
        continue;
      }
      const owners = actionMap.get(normalized) ?? new Set<string>();
      owners.add(pkg.packageId);
      actionMap.set(normalized, owners);
    }
  }

  const actionToCapabilities = new Map<string, readonly string[]>();
  for (const [action, owners] of actionMap) {
    actionToCapabilities.set(action, [...owners].sort());
  }

  return {
    packages: [...packages],
    actionToCapabilities,
  };
}

export function assertCapabilitySurfaceConvergence(
  surface: CapabilitySurface,
  exposedActions: readonly string[],
): void {
  const declared = new Set(surface.actionToCapabilities.keys());
  const exposed = new Set(exposedActions.map((name) => normalizeActionName(name)).filter(Boolean));

  const declaredButUnavailable = [...declared].filter((name) => !exposed.has(name)).sort();
  if (declaredButUnavailable.length > 0) {
    throw new Error(
      `Capability surface declares unavailable actions: ${declaredButUnavailable.join(", ")}.`,
    );
  }

  const availableButUndeclared = [...exposed].filter((name) => !declared.has(name)).sort();
  if (availableButUndeclared.length > 0) {
    throw new Error(
      `Capability surface is missing declarations for exposed actions: ${availableButUndeclared.join(", ")}.`,
    );
  }
}

function normalizeActionName(value: string): string {
  return value.trim();
}

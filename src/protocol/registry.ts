import type { CapabilityAdapter } from "./adapter.js";
import type { CapabilityPackage } from "./package.js";
import { formatCapabilityRegistrySummary, type CapabilityRegistrySummaryOptions } from "./summary.js";

export interface CapabilityPackageProvider {
  listCapabilityPackages(): CapabilityPackage[];
}

export class CapabilityRegistry {
  private readonly packagesById: Map<string, CapabilityPackage>;

  constructor(packages: readonly CapabilityPackage[]) {
    this.packagesById = new Map();
    for (const pkg of packages) {
      if (this.packagesById.has(pkg.packageId)) {
        throw new Error(`Duplicate capability package '${pkg.packageId}'.`);
      }
      this.packagesById.set(pkg.packageId, pkg);
    }
  }

  static fromProviders(providers: readonly CapabilityPackageProvider[]): CapabilityRegistry {
    return new CapabilityRegistry(providers.flatMap((provider) => provider.listCapabilityPackages()));
  }

  static fromAdapters(adapters: readonly CapabilityAdapter[]): CapabilityRegistry {
    return CapabilityRegistry.fromProviders(adapters);
  }

  list(): CapabilityPackage[] {
    return [...this.packagesById.values()];
  }

  resolve(packageId: string): CapabilityPackage {
    const pkg = this.packagesById.get(packageId);
    if (!pkg) {
      throw new Error(`Capability package '${packageId}' is not registered.`);
    }
    return pkg;
  }

  summarizeForLead(options: CapabilityRegistrySummaryOptions = {}): string {
    return formatCapabilityRegistrySummary(this.list(), options);
  }
}

export function formatCapabilityRegistryForLead(
  providers: readonly CapabilityPackageProvider[],
  options: CapabilityRegistrySummaryOptions = {},
): string {
  return CapabilityRegistry.fromProviders(providers).summarizeForLead(options);
}

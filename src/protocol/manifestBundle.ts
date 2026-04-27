import { createStaticCapabilityAdapter, type CapabilityAdapter } from "./adapter.js";
import {
  CAPABILITY_MANIFEST_PROTOCOL,
  createCapabilityPackagesFromManifests,
  parseCapabilityPackageManifest,
  type CapabilityPackageManifest,
} from "./manifest.js";
import {
  isCapabilityAdapterKind,
  isCapabilitySourceKind,
  type CapabilityAdapterKind,
  type CapabilitySourceKind,
} from "./package.js";

export const CAPABILITY_MANIFEST_BUNDLE_PROTOCOL = "deadmouse.capability-manifest-bundle" as const;

export interface CapabilityManifestBundle {
  protocol: typeof CAPABILITY_MANIFEST_BUNDLE_PROTOCOL;
  id: string;
  description: string;
  sourceKind: CapabilitySourceKind;
  adapterKind: CapabilityAdapterKind;
  manifests: readonly CapabilityPackageManifest[];
}

export function createCapabilityAdapterFromManifestBundle(bundle: CapabilityManifestBundle): CapabilityAdapter {
  if (bundle.protocol !== CAPABILITY_MANIFEST_BUNDLE_PROTOCOL) {
    throw new Error(`Unsupported capability manifest bundle protocol '${String(bundle.protocol)}'.`);
  }

  return createStaticCapabilityAdapter({
    id: bundle.id,
    kind: bundle.adapterKind,
    sourceKind: bundle.sourceKind,
    description: bundle.description,
    packages: createCapabilityPackagesFromManifests(bundle.manifests),
  });
}

export function parseCapabilityManifestBundle(value: unknown): CapabilityManifestBundle {
  const record = readRecord(value, "CapabilityManifestBundle");
  const protocol = readText(record, "protocol", "CapabilityManifestBundle");
  if (protocol !== CAPABILITY_MANIFEST_BUNDLE_PROTOCOL) {
    throw new Error(`Unsupported capability manifest bundle protocol '${protocol}'.`);
  }

  const sourceKind = readText(record, "sourceKind", "CapabilityManifestBundle");
  if (!isCapabilitySourceKind(sourceKind)) {
    throw new Error(`Unsupported capability bundle source kind '${sourceKind}'.`);
  }

  const adapterKind = readText(record, "adapterKind", "CapabilityManifestBundle");
  if (!isCapabilityAdapterKind(adapterKind)) {
    throw new Error(`Unsupported capability bundle adapter kind '${adapterKind}'.`);
  }

  const manifests = record.manifests;
  if (!Array.isArray(manifests) || manifests.length === 0) {
    throw new Error("CapabilityManifestBundle.manifests must be a non-empty array.");
  }

  return {
    protocol: CAPABILITY_MANIFEST_BUNDLE_PROTOCOL,
    id: readText(record, "id", "CapabilityManifestBundle"),
    description: readText(record, "description", "CapabilityManifestBundle"),
    sourceKind,
    adapterKind,
    manifests: manifests.map((manifest) => parseCapabilityPackageManifest({
      ...(readRecord(manifest, "CapabilityPackageManifest")),
      protocol: CAPABILITY_MANIFEST_PROTOCOL,
    })),
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readText(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}.${key} is required.`);
  }
  return value.trim();
}

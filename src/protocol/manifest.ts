import type { CapabilityKind, CapabilityCost } from "./capability.js";
import { createCapabilityProfile, isCapabilityCost, isCapabilityKind } from "./capability.js";
import {
  createCapabilityPackage,
  isCapabilityAdapterKind,
  isCapabilitySourceKind,
  type CapabilityAdapterKind,
  type CapabilityPackage,
  type CapabilitySourceKind,
} from "./package.js";
import type { CapabilityRunnerType } from "./runner.js";
import { isCapabilityRunnerType } from "./runner.js";

export const CAPABILITY_MANIFEST_PROTOCOL = "deadmouse.capability-manifest" as const;

export interface CapabilityPackageManifest {
  protocol: typeof CAPABILITY_MANIFEST_PROTOCOL;
  packageId?: string;
  version?: string;
  kind: CapabilityKind;
  id: string;
  name: string;
  description: string;
  source: {
    kind: CapabilitySourceKind;
    id?: string;
    path?: string;
    builtIn?: boolean;
  };
  adapter: {
    kind: CapabilityAdapterKind;
    id: string;
    description: string;
  };
  runnerType: CapabilityRunnerType;
  inputSchema?: string;
  outputSchema?: string;
  budgetPolicy?: string;
  artifactPolicy?: string;
  closeoutPolicy?: string;
  availability?: string;
  tools?: readonly string[];
  cost?: CapabilityCost;
  bestFor?: readonly string[];
  notFor?: readonly string[];
  extensionPoint?: string;
}

export function createCapabilityPackageFromManifest(manifest: CapabilityPackageManifest): CapabilityPackage {
  if (manifest.protocol !== CAPABILITY_MANIFEST_PROTOCOL) {
    throw new Error(`Unsupported capability manifest protocol '${String(manifest.protocol)}'.`);
  }

  return createCapabilityPackage({
    packageId: manifest.packageId,
    version: manifest.version,
    profile: createCapabilityProfile({
      kind: manifest.kind,
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      bestFor: manifest.bestFor,
      notFor: manifest.notFor,
      inputSchema: manifest.inputSchema,
      outputSchema: manifest.outputSchema,
      budgetPolicy: manifest.budgetPolicy,
      tools: manifest.tools,
      cost: manifest.cost,
      extensionPoint: manifest.extensionPoint ?? manifest.source.path ?? manifest.source.id ?? manifest.id,
    }),
    source: {
      kind: manifest.source.kind,
      id: manifest.source.id,
      path: manifest.source.path,
      builtIn: manifest.source.builtIn ?? false,
    },
    adapter: manifest.adapter,
    runnerType: manifest.runnerType,
    budgetPolicy: manifest.budgetPolicy,
    artifactPolicy: manifest.artifactPolicy,
    closeoutPolicy: manifest.closeoutPolicy,
    availability: manifest.availability,
    useWhen: manifest.bestFor,
    avoidWhen: manifest.notFor,
  });
}

export function createCapabilityPackagesFromManifests(
  manifests: readonly CapabilityPackageManifest[],
): CapabilityPackage[] {
  return manifests.map(createCapabilityPackageFromManifest);
}

export function parseCapabilityPackageManifest(value: unknown): CapabilityPackageManifest {
  const record = readRecord(value, "CapabilityPackageManifest");
  const protocol = readText(record, "protocol", "CapabilityPackageManifest");
  if (protocol !== CAPABILITY_MANIFEST_PROTOCOL) {
    throw new Error(`Unsupported capability manifest protocol '${protocol}'.`);
  }

  const kind = readText(record, "kind", "CapabilityPackageManifest");
  if (!isCapabilityKind(kind)) {
    throw new Error(`Unsupported capability kind '${kind}'.`);
  }

  const runnerType = readText(record, "runnerType", "CapabilityPackageManifest");
  if (!isCapabilityRunnerType(runnerType)) {
    throw new Error(`Unsupported capability runner type '${runnerType}'.`);
  }

  const source = readRecord(record.source, "CapabilityPackageManifest.source");
  const sourceKind = readText(source, "kind", "CapabilityPackageManifest.source");
  if (!isCapabilitySourceKind(sourceKind)) {
    throw new Error(`Unsupported capability source kind '${sourceKind}'.`);
  }

  const adapter = readRecord(record.adapter, "CapabilityPackageManifest.adapter");
  const adapterKind = readText(adapter, "kind", "CapabilityPackageManifest.adapter");
  if (!isCapabilityAdapterKind(adapterKind)) {
    throw new Error(`Unsupported capability adapter kind '${adapterKind}'.`);
  }

  const rawCost = readOptionalText(record, "cost");
  const cost = rawCost && isCapabilityCost(rawCost) ? rawCost : undefined;
  if (rawCost && !cost) {
    throw new Error(`Unsupported capability cost '${rawCost}'.`);
  }

  return {
    protocol: CAPABILITY_MANIFEST_PROTOCOL,
    packageId: readOptionalText(record, "packageId"),
    version: readOptionalText(record, "version"),
    kind,
    id: readText(record, "id", "CapabilityPackageManifest"),
    name: readText(record, "name", "CapabilityPackageManifest"),
    description: readText(record, "description", "CapabilityPackageManifest"),
    source: {
      kind: sourceKind,
      id: readOptionalText(source, "id"),
      path: readOptionalText(source, "path"),
      builtIn: typeof source.builtIn === "boolean" ? source.builtIn : undefined,
    },
    adapter: {
      kind: adapterKind,
      id: readText(adapter, "id", "CapabilityPackageManifest.adapter"),
      description: readText(adapter, "description", "CapabilityPackageManifest.adapter"),
    },
    runnerType,
    inputSchema: readOptionalText(record, "inputSchema"),
    outputSchema: readOptionalText(record, "outputSchema"),
    budgetPolicy: readOptionalText(record, "budgetPolicy"),
    artifactPolicy: readOptionalText(record, "artifactPolicy"),
    closeoutPolicy: readOptionalText(record, "closeoutPolicy"),
    availability: readOptionalText(record, "availability"),
    tools: readOptionalTextArray(record, "tools"),
    cost,
    bestFor: readOptionalTextArray(record, "bestFor"),
    notFor: readOptionalTextArray(record, "notFor"),
    extensionPoint: readOptionalText(record, "extensionPoint"),
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readText(record: Record<string, unknown>, key: string, label: string): string {
  const value = readOptionalText(record, key);
  if (!value) {
    throw new Error(`${label}.${key} is required.`);
  }
  return value;
}

function readOptionalText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalTextArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`CapabilityPackageManifest.${key} must be an array.`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

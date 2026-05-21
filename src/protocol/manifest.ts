import type { CapabilityKind, CapabilityCost } from "./capability.js";
import { createCapabilityProfile, isCapabilityCost, isCapabilityKind } from "./capability.js";
import {
  createCapabilityPackage,
  isCapabilityAdapterKind,
  isCapabilitySourceKind,
  type CapabilityAdapterKind,
  type CapabilityPackage,
  type CapabilityPackageGovernance,
  type CapabilitySourceKind,
} from "./package.js";
import type { CapabilityPortInput } from "./port.js";

export const CAPABILITY_MANIFEST_PROTOCOL = "kitty.capability-manifest" as const;

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
  port: CapabilityPortInput;
  inputSchema?: string;
  outputSchema?: string;
  budgetPolicy?: string;
  availability?: string;
  tools?: readonly string[];
  cost?: CapabilityCost;
  bestFor?: readonly string[];
  notFor?: readonly string[];
  extensionPoint?: string;
  governance?: Partial<CapabilityPackageGovernance>;
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
    port: manifest.port,
    availability: manifest.availability,
    useWhen: manifest.bestFor,
    avoidWhen: manifest.notFor,
    governance: manifest.governance,
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
    port: parseCapabilityPortInput(record.port),
    inputSchema: readOptionalText(record, "inputSchema"),
    outputSchema: readOptionalText(record, "outputSchema"),
    budgetPolicy: readOptionalText(record, "budgetPolicy"),
    availability: readOptionalText(record, "availability"),
    tools: readOptionalTextArray(record, "tools"),
    cost,
    bestFor: readOptionalTextArray(record, "bestFor"),
    notFor: readOptionalTextArray(record, "notFor"),
    extensionPoint: readOptionalText(record, "extensionPoint"),
    governance: parseGovernance(record.governance),
  };
}

function parseCapabilityPortInput(value: unknown): CapabilityPortInput {
  const port = readRecord(value, "CapabilityPackageManifest.port");
  const runner = readRecord(port.runner, "CapabilityPackageManifest.port.runner");
  const permissionBoundary = readRecord(port.permissionBoundary, "CapabilityPackageManifest.port.permissionBoundary");
  const foregroundOutput = readRecord(port.foregroundOutput, "CapabilityPackageManifest.port.foregroundOutput");
  const closeout = readRecord(port.closeout, "CapabilityPackageManifest.port.closeout");
  const wake = readRecord(port.wake, "CapabilityPackageManifest.port.wake");

  return {
    runner: {
      type: readText(runner, "type", "CapabilityPackageManifest.port.runner"),
      invocation: readText(runner, "invocation", "CapabilityPackageManifest.port.runner"),
      createsExecution: typeof runner.createsExecution === "boolean" ? runner.createsExecution : undefined,
      emitsProgress: typeof runner.emitsProgress === "boolean" ? runner.emitsProgress : undefined,
      emitsArtifacts: typeof runner.emitsArtifacts === "boolean" ? runner.emitsArtifacts : undefined,
      emitsCloseout: typeof runner.emitsCloseout === "boolean" ? runner.emitsCloseout : undefined,
      emitsWakeSignal: typeof runner.emitsWakeSignal === "boolean" ? runner.emitsWakeSignal : undefined,
      leadWaitPolicy: parseLeadWaitPolicyInput(runner.leadWaitPolicy),
    },
    permissionBoundary: {
      world: readText(permissionBoundary, "world", "CapabilityPackageManifest.port.permissionBoundary"),
      autonomy: readText(permissionBoundary, "autonomy", "CapabilityPackageManifest.port.permissionBoundary"),
      read: readTextArray(permissionBoundary, "read"),
      write: readTextArray(permissionBoundary, "write"),
      forbidden: readTextArray(permissionBoundary, "forbidden"),
    },
    foregroundOutput: {
      mode: readText(foregroundOutput, "mode", "CapabilityPackageManifest.port.foregroundOutput") as CapabilityPortInput["foregroundOutput"]["mode"],
      sink: "runtime-ui",
      section: readText(foregroundOutput, "section", "CapabilityPackageManifest.port.foregroundOutput"),
      streams: readTextArray(foregroundOutput, "streams"),
    },
    artifacts: readArtifactDeclarations(port.artifacts),
    closeout: {
      required: closeout.required !== false,
      contract: "CloseoutContract",
      requiredEvidence: readTextArray(closeout, "requiredEvidence"),
      mergeProposal: readText(closeout, "mergeProposal", "CapabilityPackageManifest.port.closeout") as CapabilityPortInput["closeout"]["mergeProposal"],
    },
    wake: {
      required: wake.required !== false,
      reasons: readTextArray(wake, "reasons"),
    },
  };
}

function parseLeadWaitPolicyInput(value: unknown): CapabilityPortInput["runner"]["leadWaitPolicy"] {
  if (value === undefined) {
    return undefined;
  }
  const record = readRecord(value, "CapabilityPackageManifest.port.runner.leadWaitPolicy");
  const result: NonNullable<CapabilityPortInput["runner"]["leadWaitPolicy"]> = {};
  const lead = readOptionalText(record, "lead");
  if (lead === "none" || lead === "while_execution_active") {
    result.lead = lead;
  }
  const wake = readOptionalText(record, "wake");
  if (wake === "optional" || wake === "required") {
    result.wake = wake;
  }
  const scope = readOptionalText(record, "scope");
  if (scope === "global" || scope === "objective" || scope === "task") {
    result.scope = scope;
  }
  const terminalStatuses = readOptionalTextArray(record, "terminalStatuses");
  if (terminalStatuses) {
    result.terminalStatuses = terminalStatuses.filter((status) =>
      status === "completed" || status === "failed" || status === "aborted" || status === "paused") as NonNullable<typeof result.terminalStatuses>;
  }
  return result;
}

function readArtifactDeclarations(value: unknown): CapabilityPortInput["artifacts"] {
  if (!Array.isArray(value)) {
    throw new Error("CapabilityPackageManifest.port.artifacts must be an array.");
  }
  return value.map((item) => {
    const record = readRecord(item, "CapabilityPackageManifest.port.artifacts");
    return {
      kind: readText(record, "kind", "CapabilityPackageManifest.port.artifacts"),
      name: readText(record, "name", "CapabilityPackageManifest.port.artifacts"),
      description: readText(record, "description", "CapabilityPackageManifest.port.artifacts"),
      required: record.required === true,
    };
  });
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

function readTextArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`CapabilityPackageManifest.${key} must be an array.`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseGovernance(value: unknown): Partial<CapabilityPackageGovernance> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = readRecord(value, "CapabilityPackageManifest.governance");
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    installed: typeof record.installed === "boolean" ? record.installed : undefined,
    installRef: readOptionalText(record, "installRef"),
    dependencies: parseDependencies(record.dependencies, "dependencies"),
    versionConstraints: parseDependencies(record.versionConstraints, "versionConstraints"),
    diagnostics: parseDiagnostics(record.diagnostics),
  };
}

function parseDependencies(value: unknown, label: string): CapabilityPackageGovernance["dependencies"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`CapabilityPackageManifest.governance.${label} must be an array.`);
  }
  return value.map((item) => {
    const record = readRecord(item, `CapabilityPackageManifest.governance.${label}`);
    return {
      packageId: readText(record, "packageId", `CapabilityPackageManifest.governance.${label}`),
      version: readOptionalText(record, "version"),
      optional: typeof record.optional === "boolean" ? record.optional : undefined,
    };
  });
}

function parseDiagnostics(value: unknown): CapabilityPackageGovernance["diagnostics"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("CapabilityPackageManifest.governance.diagnostics must be an array.");
  }
  return value.map((item) => {
    const record = readRecord(item, "CapabilityPackageManifest.governance.diagnostics");
    const severity = readText(record, "severity", "CapabilityPackageManifest.governance.diagnostics");
    if (severity !== "info" && severity !== "warning" && severity !== "error") {
      throw new Error(`Unsupported capability governance diagnostic severity '${severity}'.`);
    }
    return {
      severity,
      message: readText(record, "message", "CapabilityPackageManifest.governance.diagnostics"),
      code: readOptionalText(record, "code"),
    };
  });
}

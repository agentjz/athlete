import path from "node:path";

import { isExtensionHookName, type ExtensionHookName } from "./hook.js";

export const EXTENSION_MANIFEST_PROTOCOL = "kitty.extension-manifest" as const;
export const EXTENSION_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ExtensionSourceKind = "workflow";

export interface ExtensionManifest {
  protocol: typeof EXTENSION_MANIFEST_PROTOCOL;
  schemaVersion: typeof EXTENSION_MANIFEST_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  source: {
    kind: ExtensionSourceKind;
    id: string;
  };
  entry: {
    kind: "module";
    moduleId: string;
  };
  hooks: ExtensionHookName[];
  workspace: {
    root: string;
  };
  modelSummary: string;
}

export function createExtensionManifest(input: Omit<ExtensionManifest, "protocol" | "schemaVersion">): ExtensionManifest {
  return parseExtensionManifest({
    protocol: EXTENSION_MANIFEST_PROTOCOL,
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    ...input,
  });
}

export function parseExtensionManifest(value: unknown): ExtensionManifest {
  const record = readRecord(value, "ExtensionManifest");
  const protocol = readText(record, "protocol", "ExtensionManifest");
  if (protocol !== EXTENSION_MANIFEST_PROTOCOL) {
    throw new Error(`Unsupported extension manifest protocol '${protocol}'.`);
  }

  const schemaVersion = readNumber(record, "schemaVersion", "ExtensionManifest");
  if (schemaVersion !== EXTENSION_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported extension manifest schema version '${schemaVersion}'.`);
  }

  const source = readRecord(record.source, "ExtensionManifest.source");
  const sourceKind = readText(source, "kind", "ExtensionManifest.source");
  if (!isExtensionSourceKind(sourceKind)) {
    throw new Error(`Unsupported extension source kind '${sourceKind}'.`);
  }

  const entry = readRecord(record.entry, "ExtensionManifest.entry");
  const entryKind = readText(entry, "kind", "ExtensionManifest.entry");
  if (entryKind !== "module") {
    throw new Error(`Unsupported extension entry kind '${entryKind}'.`);
  }

  const workspace = readRecord(record.workspace, "ExtensionManifest.workspace");
  const workspaceRoot = normalizeRelativePath(readText(workspace, "root", "ExtensionManifest.workspace"));
  const hooks = readTextArray(record, "hooks", "ExtensionManifest")
    .map((hook) => {
      if (!isExtensionHookName(hook)) {
        throw new Error(`Unsupported extension hook '${hook}'.`);
      }
      return hook;
    });

  if (hooks.length === 0) {
    throw new Error("ExtensionManifest.hooks must contain at least one hook.");
  }

  return {
    protocol: EXTENSION_MANIFEST_PROTOCOL,
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    id: normalizeExtensionId(readText(record, "id", "ExtensionManifest")),
    name: readText(record, "name", "ExtensionManifest"),
    version: readText(record, "version", "ExtensionManifest"),
    description: readText(record, "description", "ExtensionManifest"),
    source: {
      kind: sourceKind,
      id: normalizeExtensionId(readText(source, "id", "ExtensionManifest.source")),
    },
    entry: {
      kind: "module",
      moduleId: readText(entry, "moduleId", "ExtensionManifest.entry"),
    },
    hooks,
    workspace: {
      root: workspaceRoot,
    },
    modelSummary: readText(record, "modelSummary", "ExtensionManifest"),
  };
}

export function normalizeExtensionId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Extension id cannot be empty.");
  }
  return normalized;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized) || normalized.includes("..")) {
    throw new Error(`Extension workspace root must be a safe relative path: '${value}'.`);
  }
  return normalized;
}

function isExtensionSourceKind(value: unknown): value is ExtensionSourceKind {
  return value === "workflow";
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

function readNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${key} must be a number.`);
  }
  return value;
}

function readTextArray(record: Record<string, unknown>, key: string, label: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array.`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${label}.${key} must contain strings.`);
    }
    return item.trim();
  });
}

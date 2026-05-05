import type { ExtensionManifest } from "./manifest.js";

export const EXTENSION_REGISTRY_PROTOCOL = "kitty.extension-registry" as const;
export const EXTENSION_REGISTRY_SCHEMA_VERSION = 1 as const;

export interface ExtensionRegistryEntry {
  id: string;
  enabled: boolean;
  source: ExtensionManifest["source"];
  version: string;
  entry: ExtensionManifest["entry"];
  manifestPath: string;
  workspaceRoot: string;
  manifest: ExtensionManifest;
}

export interface ExtensionRegistrySnapshot {
  protocol: typeof EXTENSION_REGISTRY_PROTOCOL;
  schemaVersion: typeof EXTENSION_REGISTRY_SCHEMA_VERSION;
  entries: ExtensionRegistryEntry[];
}

export function createExtensionRegistrySnapshot(entries: ExtensionRegistryEntry[]): ExtensionRegistrySnapshot {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate extension registry entry '${entry.id}'.`);
    }
    seen.add(entry.id);
  }

  return {
    protocol: EXTENSION_REGISTRY_PROTOCOL,
    schemaVersion: EXTENSION_REGISTRY_SCHEMA_VERSION,
    entries: [...entries],
  };
}

export function createRegistryEntryFromManifest(input: {
  manifest: ExtensionManifest;
  manifestPath: string;
  enabled: boolean;
}): ExtensionRegistryEntry {
  return {
    id: input.manifest.id,
    enabled: input.enabled,
    source: input.manifest.source,
    version: input.manifest.version,
    entry: input.manifest.entry,
    manifestPath: input.manifestPath,
    workspaceRoot: input.manifest.workspace.root,
    manifest: input.manifest,
  };
}

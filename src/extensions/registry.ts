import { EXTENSION_IDS, getExtensionDefinition, type ExtensionId } from "./definitions.js";
import type { RegisteredTool } from "../tools/core/types.js";
import type { RuntimeConfig } from "../types.js";

export interface ExtensionRegistryEntry {
  id: ExtensionId;
  enabled: boolean;
  tools: readonly RegisteredTool[];
}

export interface ExtensionRegistrySnapshot {
  entries: ExtensionRegistryEntry[];
}

export function createExtensionRegistry(config: RuntimeConfig): ExtensionRegistrySnapshot {
  return {
    entries: EXTENSION_IDS.map((id) => createEntry(id, config)),
  };
}

function createEntry(
  id: ExtensionId,
  config: RuntimeConfig,
): ExtensionRegistryEntry {
  return {
    id,
    enabled: config.extensions[id],
    tools: config.extensions[id] ? createExtensionTools(id) : [],
  };
}

function createExtensionTools(id: ExtensionId): readonly RegisteredTool[] {
  return getExtensionDefinition(id).createTools();
}

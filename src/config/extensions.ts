import type { AppConfig } from "../types.js";
import { EXTENSION_DEFINITIONS, EXTENSION_IDS, type ExtensionId } from "../extensions/definitions.js";

export { EXTENSION_IDS, type ExtensionId };

export type ExtensionToggleConfig = Record<ExtensionId, boolean>;

const INITIAL_EXTENSION_SWITCHES: ExtensionToggleConfig = createInitialExtensionSwitches();

export function getInitialExtensionSwitches(): ExtensionToggleConfig {
  return { ...INITIAL_EXTENSION_SWITCHES };
}

export function normalizeExtensions(value: unknown): ExtensionToggleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Missing extension switch configuration.");
  }

  const record = value as Record<string, unknown>;
  const normalized = {} as ExtensionToggleConfig;
  for (const id of EXTENSION_IDS) {
    normalized[id] = readRequiredBoolean(record[id], id);
  }
  return normalized;
}

export function readEnabledExtensionIds(config: Pick<AppConfig, "extensions">): ExtensionId[] {
  return EXTENSION_IDS.filter((id) => config.extensions[id]);
}

function readRequiredBoolean(value: unknown, id: ExtensionId): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Missing or invalid extension switch: ${id}.`);
  }
  return value;
}

function createInitialExtensionSwitches(): ExtensionToggleConfig {
  const switches = Object.fromEntries(
    EXTENSION_IDS.map((id) => [id, false]),
  ) as ExtensionToggleConfig;
  for (const definition of EXTENSION_DEFINITIONS) {
    switches[definition.id] = definition.defaultEnabled;
  }
  return switches;
}

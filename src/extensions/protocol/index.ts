export type { KittyProductMode } from "./mode.js";
export {
  EXTENSION_HOOKS,
  createEmptyHookOutput,
  isExtensionHookName,
  type ExtensionHookContext,
  type ExtensionHookName,
  type ExtensionHookOutput,
  type ExtensionHookRun,
} from "./hook.js";
export {
  EXTENSION_MANIFEST_PROTOCOL,
  EXTENSION_MANIFEST_SCHEMA_VERSION,
  createExtensionManifest,
  normalizeExtensionId,
  parseExtensionManifest,
  type ExtensionManifest,
  type ExtensionSourceKind,
} from "./manifest.js";
export {
  EXTENSION_REGISTRY_PROTOCOL,
  EXTENSION_REGISTRY_SCHEMA_VERSION,
  createExtensionRegistrySnapshot,
  createRegistryEntryFromManifest,
  type ExtensionRegistryEntry,
  type ExtensionRegistrySnapshot,
} from "./registry.js";
export {
  resolveExtensionSessionWorkspace,
  resolveExtensionWorkspace,
  type ExtensionWorkspace,
} from "./workspace.js";
export type { ExtensionProvider, KittyExtension } from "./extension.js";

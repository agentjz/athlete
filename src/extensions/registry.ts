import { buildExtensionEcology } from "./ecology/index.js";
import {
  createExtensionRegistrySnapshot,
  createRegistryEntryFromManifest,
  type ExtensionRegistrySnapshot,
  type KittyProductMode,
} from "./protocol/index.js";

export function buildExtensionRegistry(mode: KittyProductMode): ExtensionRegistrySnapshot {
  if (mode === "agent") {
    return createExtensionRegistrySnapshot([]);
  }

  const ecology = buildExtensionEcology();
  return createExtensionRegistrySnapshot(
    ecology.entries.map((entry) => createRegistryEntryFromManifest({
      manifest: entry.extension.manifest,
      enabled: entry.enabled,
      manifestPath: entry.manifestPath,
    })),
  );
}

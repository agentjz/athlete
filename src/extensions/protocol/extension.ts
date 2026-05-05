import type { ExtensionHookContext, ExtensionHookName, ExtensionHookOutput } from "./hook.js";
import type { ExtensionManifest } from "./manifest.js";

export interface KittyExtension {
  manifest: ExtensionManifest;
  runHook(hook: ExtensionHookName, context: ExtensionHookContext): Promise<ExtensionHookOutput>;
}

export interface ExtensionProvider {
  sourceId: string;
  listExtensions(): ExtensionProviderEntry[];
}

export interface ExtensionProviderEntry {
  extension: KittyExtension;
  enabled: boolean;
  manifestPath: string;
}

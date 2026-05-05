import type { ExtensionProvider, KittyExtension } from "../protocol/extension.js";
import { listWorkflowExtensionProviders } from "./workflows.js";

export interface ExtensionEcology {
  providers: ExtensionProvider[];
  entries: ReturnType<ExtensionProvider["listExtensions"]>;
  extensions: KittyExtension[];
}

export function buildExtensionEcology(): ExtensionEcology {
  const providers = [
    ...listWorkflowExtensionProviders(),
  ];
  const entries = providers.flatMap((provider) => provider.listExtensions());
  return {
    providers,
    entries,
    extensions: entries.map((entry) => entry.extension),
  };
}

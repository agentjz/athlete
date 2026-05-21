import { createRuntimeToolRegistry } from "./core/runtimeRegistry.js";
import { createToolSource } from "./core/sources.js";
import { createExtensionRegistry } from "../extensions/index.js";
import type { RuntimeConfig } from "../types.js";
import { getBuiltinToolNames } from "./toolCatalog.js";

export function createDefaultAgentToolRegistry(config: RuntimeConfig) {
  const extensionRegistry = createExtensionRegistry(config);
  const extensionSources = extensionRegistry.entries
    .filter((entry) => entry.enabled && entry.tools.length > 0)
    .map((entry) => createToolSource("host", `extension:${entry.id}`, entry.tools));
  const extensionToolNames = extensionRegistry.entries
    .filter((entry) => entry.enabled)
    .flatMap((entry) => entry.tools.map((tool) => tool.definition.function.name));

  return createRuntimeToolRegistry(config, {
    onlyNames: [...getBuiltinToolNames(), ...extensionToolNames],
    sources: extensionSources,
  });
}

import { createDefaultAgentToolRegistry } from "../tools/registry.js";
import { createRuntimeToolRegistry } from "../tools/core/runtimeRegistry.js";
import { createToolSource } from "../tools/core/sources.js";
import type { RegisteredTool, ToolRegistry } from "../tools/index.js";
import type { ToolFilter } from "../tools/core/types.js";
import { getBuiltinTools } from "../tools/toolCatalog.js";
import type { RuntimeConfig } from "../types.js";

export interface HostToolRegistryOptions {
  builtinToolFilter?: ToolFilter;
  extraTools?: readonly RegisteredTool[];
}

export async function createHostToolRegistry(
  config: RuntimeConfig,
  options: HostToolRegistryOptions = {},
): Promise<ToolRegistry> {
  const extraTools = options.extraTools ?? [];
  if (extraTools.length === 0 && !options.builtinToolFilter) {
    return createDefaultAgentToolRegistry(config);
  }
  const builtinToolNames = getBuiltinTools()
    .filter(options.builtinToolFilter ?? (() => true))
    .map((tool) => tool.definition.function.name);

  return createRuntimeToolRegistry(config, {
    onlyNames: [
      ...builtinToolNames,
      ...extraTools.map((tool) => tool.definition.function.name),
    ],
    builtinToolFilter: options.builtinToolFilter,
    sources: [createToolSource("host", "host:extra-tools", extraTools)],
  });
}

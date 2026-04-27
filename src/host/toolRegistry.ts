import { createRuntimeToolRegistry } from "../capabilities/tools/core/runtimeRegistry.js";
import { createToolSource } from "../capabilities/tools/core/registry.js";
import type { RuntimeConfig } from "../types.js";
import type { ToolRegistry } from "../capabilities/tools/core/types.js";
import type { HostToolRegistryOptions } from "./types.js";

export async function createHostToolRegistry(
  config: RuntimeConfig,
  options: HostToolRegistryOptions = {},
): Promise<ToolRegistry> {
  return createRuntimeToolRegistry(config, {
    sources: options.extraTools && options.extraTools.length > 0
      ? [createToolSource("host", "host:extra-tools", options.extraTools)]
      : [],
  });
}

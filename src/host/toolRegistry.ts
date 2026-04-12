import { createRuntimeToolRegistry } from "../tools/runtimeRegistry.js";
import { createToolSource } from "../tools/registry.js";
import type { RuntimeConfig } from "../types.js";
import type { ToolRegistry } from "../tools/types.js";
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

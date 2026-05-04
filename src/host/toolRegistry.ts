import { createRuntimeToolRegistry } from "../capabilities/tools/core/runtimeRegistry.js";
import { createToolSource } from "../capabilities/tools/core/registry.js";
import type { RuntimeConfig } from "../types.js";
import type { ToolRegistry } from "../capabilities/tools/core/types.js";
import type { HostToolRegistryOptions } from "./types.js";

const AGENT_TOOL_NAMES = ["read", "edit", "write", "bash"] as const;

export async function createHostToolRegistry(
  config: RuntimeConfig,
  options: HostToolRegistryOptions = {},
): Promise<ToolRegistry> {
  const extraTools = options.extraTools ?? [];
  if ((options.mode ?? "agent") === "agent") {
    return createRuntimeToolRegistry(config, {
      onlyNames: [
        ...AGENT_TOOL_NAMES,
        ...extraTools.map((tool) => tool.definition.function.name),
      ],
      sources: extraTools.length > 0
        ? [createToolSource("host", "host:extra-tools", extraTools)]
        : [],
    });
  }

  return createRuntimeToolRegistry(config, {
    sources: extraTools.length > 0
      ? [createToolSource("host", "host:extra-tools", extraTools)]
      : [],
  });
}

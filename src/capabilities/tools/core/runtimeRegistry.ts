import { McpClientManager } from "../../mcp/clientManager.js";
import { createLazyMcpToolSources } from "../../mcp/lazySources.js";
import type { RuntimeConfig } from "../../../types.js";
import { createToolRegistry } from "./registry.js";
import type { ToolRegistry, ToolRegistryOptions, ToolRegistrySource } from "./types.js";

export interface RuntimeToolRegistryDependencies {
  manager?: McpClientManager;
  collectMcpSources?: (config: RuntimeConfig["mcp"]) => Promise<ToolRegistrySource[]>;
  close?: () => Promise<void>;
}

export async function createRuntimeToolRegistry(
  config: RuntimeConfig,
  options: ToolRegistryOptions = {},
  dependencies: RuntimeToolRegistryDependencies = {},
): Promise<ToolRegistry> {
  const manager = dependencies.manager ?? new McpClientManager(config.mcp);
  const mcpSources = dependencies.collectMcpSources
    ? await dependencies.collectMcpSources(config.mcp)
    : createLazyMcpToolSources(config.mcp, manager);
  const registry = createToolRegistry({
    ...options,
    sources: [...(options.sources ?? []), ...mcpSources],
  });

  return {
    ...registry,
    async close() {
      await registry.close?.();
      await dependencies.close?.();
      await manager.close();
    },
  };
}

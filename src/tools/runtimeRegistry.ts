import { McpClientManager } from "../mcp/clientManager.js";
import { collectMcpToolSources } from "../mcp/registryIntegration.js";
import type { RuntimeConfig } from "../types.js";
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
  const collectMcpSources =
    dependencies.collectMcpSources ??
    ((mcpConfig: RuntimeConfig["mcp"]) => collectMcpToolSources(mcpConfig, manager));
  const mcpSources = await collectMcpSources(config.mcp);
  const registry = createToolRegistry(config.mode, {
    ...options,
    sources: [...(options.sources ?? []), ...mcpSources],
  });

  return {
    ...registry,
    async close() {
      await registry.close?.();
      await dependencies.close?.();
      if (!dependencies.close || dependencies.manager) {
        await manager.close();
      }
    },
  };
}

import { McpClientManager } from "../mcp/clientManager.js";
import { collectMcpRegisteredTools } from "../mcp/registryIntegration.js";
import type { RuntimeConfig } from "../types.js";
import { createToolRegistry } from "./registry.js";
import type { RegisteredTool, ToolRegistry, ToolRegistryOptions } from "./types.js";

export interface RuntimeToolRegistryDependencies {
  manager?: McpClientManager;
  collectMcpTools?: (config: RuntimeConfig["mcp"]) => Promise<RegisteredTool[]>;
  close?: () => Promise<void>;
}

export async function createRuntimeToolRegistry(
  config: RuntimeConfig,
  options: ToolRegistryOptions = {},
  dependencies: RuntimeToolRegistryDependencies = {},
): Promise<ToolRegistry> {
  const manager = dependencies.manager ?? new McpClientManager(config.mcp);
  const collectMcpTools =
    dependencies.collectMcpTools ??
    ((mcpConfig: RuntimeConfig["mcp"]) => collectMcpRegisteredTools(mcpConfig, manager));
  const mcpTools = await collectMcpTools(config.mcp);
  const registry = createToolRegistry(config.mode, {
    ...options,
    includeTools: [...(options.includeTools ?? []), ...mcpTools],
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

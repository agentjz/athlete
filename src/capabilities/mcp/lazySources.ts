import type { ToolRegistrySource } from "../tools/core/types.js";
import type { McpClientManager } from "./clientManager.js";
import type { McpConfig } from "./types.js";

export function createLazyMcpToolSources(
  config: McpConfig,
  manager: McpClientManager,
): ToolRegistrySource[] {
  if (!config.enabled) {
    return [];
  }

  void manager;
  return [];
}

import { McpClientManager } from "./clientManager.js";
import { adaptDiscoveredMcpTools } from "./toolAdapter.js";
import type { McpConfig } from "./types.js";
import type { RegisteredTool } from "../tools/types.js";

export async function collectMcpRegisteredTools(
  config: McpConfig,
  manager = new McpClientManager(config),
): Promise<RegisteredTool[]> {
  if (!config.enabled) {
    return [];
  }

  await manager.refresh();
  return adaptDiscoveredMcpTools(manager.getDiscoveredTools());
}

import { McpClientManager } from "./clientManager.js";
import { adaptDiscoveredMcpTools } from "./toolAdapter.js";
import type { McpConfig } from "./types.js";
import { createToolSource } from "../tools/registry.js";
import type { ToolRegistrySource } from "../tools/types.js";

export async function collectMcpToolSources(
  config: McpConfig,
  manager = new McpClientManager(config),
): Promise<ToolRegistrySource[]> {
  if (!config.enabled) {
    return [];
  }

  await manager.refresh();
  return manager.getSnapshots()
    .filter((snapshot) => snapshot.status === "ready" && snapshot.tools.length > 0)
    .map((snapshot) =>
      createToolSource(
        "mcp",
        `mcp:${snapshot.server.name}`,
        adaptDiscoveredMcpTools(snapshot.tools),
      )
    );
}

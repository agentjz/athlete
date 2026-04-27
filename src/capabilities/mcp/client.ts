import { StdioMcpClient } from "./stdioClient.js";
import type { McpClient, McpDiscoverySnapshot, ResolvedMcpServerDefinition } from "./types.js";

export class PlaceholderMcpClient implements McpClient {
  constructor(readonly server: ResolvedMcpServerDefinition) {}

  async discover(): Promise<McpDiscoverySnapshot> {
    return {
      server: this.server,
      status: "not_implemented",
      tools: [],
      instructions: [],
      diagnostics: [
        `MCP server "${this.server.name}" is configured, but real MCP transports are not connected yet.`,
      ],
      updatedAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    return;
  }
}

export function createMcpClient(server: ResolvedMcpServerDefinition): McpClient {
  if (server.transport === "stdio") {
    return new StdioMcpClient(server);
  }

  return new PlaceholderMcpClient(server);
}

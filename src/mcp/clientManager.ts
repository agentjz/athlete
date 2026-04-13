import { resolveMcpServerDefinitions } from "./config.js";
import { createMcpClient } from "./client.js";
import { closeMcpClients, discoverMcpConnection, type McpClientFactory } from "./discovery.js";
import type { McpClient, McpConfig, McpDiscoverySnapshot, McpDiscoveredTool } from "./types.js";

export class McpClientManager {
  private snapshots: McpDiscoverySnapshot[] = [];
  private readonly activeClients = new Map<string, McpClient>();

  constructor(
    private readonly config: McpConfig,
    private readonly clientFactory: McpClientFactory = createMcpClient,
  ) {}

  async refresh(): Promise<McpDiscoverySnapshot[]> {
    if (!this.config.enabled) {
      await this.close();
      this.snapshots = [];
      return this.snapshots;
    }

    const servers = resolveMcpServerDefinitions(this.config);
    await this.close();

    const nextSnapshots: McpDiscoverySnapshot[] = [];
    for (const server of servers) {
      const discovered = await discoverMcpConnection(server, this.clientFactory);
      nextSnapshots.push(discovered.snapshot);
      if (discovered.client && discovered.snapshot.status === "ready") {
        this.activeClients.set(server.id, discovered.client);
      }
    }

    this.snapshots = nextSnapshots;
    return this.getSnapshots();
  }

  getSnapshots(): McpDiscoverySnapshot[] {
    return this.snapshots.map((snapshot) => ({
      ...snapshot,
      tools: [...snapshot.tools],
      instructions: [...snapshot.instructions],
      diagnostics: [...snapshot.diagnostics],
    }));
  }

  getDiscoveredTools(): McpDiscoveredTool[] {
    return this.snapshots.flatMap((snapshot) => snapshot.tools);
  }

  async close(): Promise<void> {
    await closeMcpClients([...this.activeClients.values()]);
    this.activeClients.clear();
  }
}
